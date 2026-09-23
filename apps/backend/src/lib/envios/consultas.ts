import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
import { receberNovidade } from "./nucleo"
import type { ParceiroDeEntrega } from "./parceiro"
import { parceiroDeEntrega, parceirosQueConsultam } from "./parceiros"
import type { SituacaoDoEnvio } from "./situacao"

/**
 * PERGUNTAR AO PARCEIRO COMO ESTÁ CADA PACOTE NA RUA.
 *
 * É o caminho do pacote que não tem aviso — na Frenet, toda etiqueta gerada
 * à mão no painel (o porquê está em `modules/frenet/rastreio.ts`). O admin
 * cadastra o código no pedido ("Mark as shipped"), o pacote vira envio
 * postado, e daqui em diante é a loja que pergunta: em trânsito, saiu pra
 * entrega, entregue. A resposta entra no núcleo como qualquer aviso
 * (`receberNovidade`) — o pedido acompanha e o cliente recebe o e-mail.
 *
 * Quem chama é o job `acompanhar-envios`, de hora em hora, e a rota
 * `POST /admin/envios/consultar`, pra quando alguém quiser agora.
 *
 * ┌─ QUEM ENTRA NA RODADA ─────────────────────────────────────────────────┐
 * │ Pacote com código, a caminho (postado, em trânsito, saiu pra entrega,  │
 * │ esperando retirada) e com menos de 45 dias: depois disso, ou chegou,   │
 * │ ou é caso de conversar com a transportadora — o job já avisa no log os │
 * │ parados há mais de 15. No máximo 100 por rodada, os mais esquecidos    │
 * │ primeiro: uma loja pequena cabe inteira, e uma grande não faz a Frenet │
 * │ responder 200 perguntas de uma vez.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const A_CAMINHO: SituacaoDoEnvio[] = [
  "postado",
  "em_transito",
  "saiu_para_entrega",
  "aguardando_retirada",
]
const JANELA_MS = 45 * 24 * 60 * 60 * 1000
const POR_RODADA = 100

export type RelatorioDaConsulta = {
  perguntados: number
  /** Os que trouxeram evento novo. */
  andaram: number
  /** Os que o parceiro não soube responder, e por quê. */
  sem_resposta: { codigo: string; motivo: string }[]
}

type Pacote = { id: string; codigo: string | null; pedido_id: string | null; parceiro: string }

export async function perguntarAosParceiros(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDaConsulta> {
  const relatorio: RelatorioDaConsulta = { perguntados: 0, andaram: 0, sem_resposta: [] }
  const quemConsulta = parceirosQueConsultam()
  if (!quemConsulta.length) return relatorio

  const envios = container.resolve<EnviosService>(ENVIOS)
  const pacotes = (await envios.listEnvios(
    {
      codigo: { $ne: null },
      situacao: A_CAMINHO,
      created_at: { $gte: new Date(agora.getTime() - JANELA_MS) },
    },
    {
      select: ["id", "codigo", "pedido_id", "parceiro"],
      take: POR_RODADA,
      order: { updated_at: "ASC" },
    }
  )) as Pacote[]
  if (!pacotes.length) return relatorio

  const servicos = await servicosDosPedidos(
    container,
    pacotes.flatMap((p) => (p.pedido_id ? [p.pedido_id] : []))
  )

  for (const pacote of pacotes) {
    if (!pacote.codigo) continue
    // Quem fala pelo pacote, se souber responder; senão, o primeiro que sabe
    // (o pacote que o admin cadastrou é da "loja", e a loja não é parceiro).
    const proprio = parceiroDeEntrega(pacote.parceiro)
    const quem: ParceiroDeEntrega = proprio?.consultar ? proprio : quemConsulta[0]!

    relatorio.perguntados++
    const resposta = await quem.consultar!({
      codigo: pacote.codigo,
      servico: (pacote.pedido_id && servicos.get(pacote.pedido_id)) || null,
    })
    if (!resposta.ok) {
      relatorio.sem_resposta.push({ codigo: pacote.codigo, motivo: resposta.motivo })
      continue
    }

    const r = await receberNovidade(container, resposta.novidade, {
      parceiro: quem.id,
      avisarCliente: true,
      pedidoId: pacote.pedido_id,
    })
    if (r.estado === "ok" && r.eventosNovos > 0) relatorio.andaram++
  }

  if (relatorio.sem_resposta.length) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[envio] ${relatorio.sem_resposta.length} pacote(s) sem resposta do parceiro: ` +
          relatorio.sem_resposta.map((s) => `${s.codigo} (${s.motivo})`).join(", ")
      )
  }
  return relatorio
}

/**
 * O código do serviço que cada pedido guardou na cotação (`data.servico`
 * do método de entrega — ver `validateFulfillmentData`, no provedor da
 * Frenet).
 */
async function servicosDosPedidos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (!ids.length) return mapa
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "shipping_methods.data"],
    filters: { id: [...new Set(ids)] },
  })
  for (const pedido of data as { id: string; shipping_methods?: { data?: unknown }[] | null }[]) {
    for (const metodo of pedido.shipping_methods ?? []) {
      const servico = (metodo?.data as { servico?: { codigo?: unknown } } | null)?.servico
      if (typeof servico?.codigo === "string" && servico.codigo) {
        mapa.set(pedido.id, servico.codigo)
        break
      }
    }
  }
  return mapa
}
