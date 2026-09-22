import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENVIOS } from "../modules/envios"
import type EnviosService from "../modules/envios/service"
import { avisarCliente } from "../lib/envios/avisos"
import { acompanharDeNovo } from "../lib/envios/nucleo"
import { avisoPendente, lerAvisos, type SituacaoDoEnvio } from "../lib/envios/situacao"

/**
 * DE HORA EM HORA, no worker: o que ficou pra trás nos envios.
 *
 *   1. O PEDIDO QUE NÃO ACOMPANHOU — o envio disse "postado" e o Medusa
 *      não deixou marcar (o banco caiu no meio, o pedido estava sendo
 *      editado). Tenta de novo por três dias; depois disso, o motivo fica
 *      na pendência do envio e no log, pra alguém olhar.
 *   2. O E-MAIL QUE NÃO SAIU — o Resend fora do ar na hora do aviso. Tenta
 *      de novo enquanto o momento ainda é notícia (`VALIDADE_DO_AVISO`).
 *   3. O PACOTE PARADO — em andamento há mais de 15 dias sem notícia. Não
 *      há o que o código faça (o aviso pode ter se perdido, ou o pacote);
 *      uma linha no log por dia, pra alguém conferir no painel do parceiro.
 *
 * O que ele ainda não faz: PERGUNTAR ao parceiro como está o pacote. É o
 * `consultar` do contrato (ver `lib/envios/parceiro.ts`) — entra aqui
 * quando o primeiro parceiro souber responder.
 */
const DIA = 24 * 60 * 60 * 1000
const EM_ANDAMENTO: SituacaoDoEnvio[] = [
  "postado",
  "em_transito",
  "saiu_para_entrega",
  "aguardando_retirada",
]
const COM_AVISO: SituacaoDoEnvio[] = [...EM_ANDAMENTO, "entregue"]

export default async function acompanharEnvios(container: MedusaContainer) {
  const envios = container.resolve<EnviosService>(ENVIOS)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const agora = new Date()

  /* 1. o pedido que não acompanhou */
  const pendentes = await envios.listEnvios(
    { pendencia: { $ne: null }, updated_at: { $gte: new Date(agora.getTime() - 3 * DIA) } },
    { select: ["id"], take: 100 }
  )
  for (const { id } of pendentes) {
    await acompanharDeNovo(container, id).catch((e) =>
      logger.warn(
        `[envio] ${id}: acompanhar de novo falhou — ${e instanceof Error ? e.message : e}`
      )
    )
  }

  /* 2. o e-mail que não saiu */
  const recentes = await envios.listEnvios(
    {
      pedido_id: { $ne: null },
      situacao: COM_AVISO,
      desde: { $gte: new Date(agora.getTime() - 7 * DIA) },
    },
    { select: ["id", "situacao", "desde", "avisos"], take: 500 }
  )
  for (const e of recentes) {
    const falta = avisoPendente(
      {
        situacao: e.situacao as SituacaoDoEnvio,
        desde: e.desde ? new Date(e.desde) : null,
        avisos: lerAvisos(e.avisos),
      },
      agora
    )
    if (!falta) continue
    await avisarCliente(container, e.id, agora).catch((erro) =>
      logger.warn(
        `[envio] ${e.id}: o aviso ao cliente falhou — ${erro instanceof Error ? erro.message : erro}`
      )
    )
  }

  /* 3. o pacote parado — uma vez por dia, no meio do expediente */
  if (agora.getUTCHours() === 15) {
    const parados = await envios.listEnvios(
      {
        pedido_id: { $ne: null },
        situacao: EM_ANDAMENTO,
        desde: { $lt: new Date(agora.getTime() - 15 * DIA) },
      },
      { select: ["codigo", "situacao"], take: 50 }
    )
    if (parados.length) {
      logger.warn(
        `[envio] ${parados.length} pacote(s) sem notícia há mais de 15 dias: ` +
          `${parados.map((p) => `${p.codigo} (${p.situacao})`).join(", ")} — confira no painel do parceiro`
      )
    }
  }
}

export const config = {
  name: "acompanhar-envios",
  schedule: "23 * * * *",
}
