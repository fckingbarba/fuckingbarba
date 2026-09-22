import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENVIOS } from "../../../../../../modules/envios"
import type EnviosService from "../../../../../../modules/envios/service"
import { limparCodigo, transportadoraPeloCodigo } from "../../../../../../lib/envios/situacao"

/**
 * GET /store/conta/pedidos/:id/rastreio — onde estão os pacotes de um pedido
 * da conta: o código, o link, a situação e a linha do tempo de cada um.
 *
 * QUEM É DONO É O MEDUSA: a leitura do pedido é pelo `query` de dentro,
 * com o filtro que a rota da loja faria — SÓ pedido do cliente do token.
 * Pedido de outra pessoa responde igual a pedido que não existe; a rota não
 * diz se o id existe. Só depois disso os envios são lidos.
 *
 * DUAS FONTES, UMA LISTA. Os envios do núcleo (`lib/envios/`) trazem a
 * situação e os eventos, venham do parceiro que vierem — a resposta fala o
 * vocabulário do núcleo, nunca o da Frenet. E as etiquetas do Medusa entram
 * pro código que ainda não virou envio (o que o admin cadastrou antes de o
 * núcleo existir): código e link, sem linha do tempo.
 *
 * O evento que o ADMIN marcou ("Postado", na hora do clique) só aparece
 * enquanto a transportadora não contou nada: depois, a história é a dela.
 * O bruto do parceiro e a chave de repetição nunca saem daqui.
 */

type Etiqueta = { tracking_number?: string | null; tracking_url?: string | null }
type Rastreio = {
  codigo: string
  url: string | null
  transportadora: string | null
  servico: string | null
  /** O vocabulário do núcleo (`situacao.ts`); `null` no código sem envio. */
  situacao: string | null
  alerta: string | null
  postadoEm: string | null
  entregueEm: string | null
  /** Do mais novo pro mais velho. */
  eventos: { tipo: string; descricao: string; local: string | null; quando: string | null }[]
}
type EnvioDoPedido = { canceled_at?: string | Date | null; labels?: (Etiqueta | null)[] | null }

const iso = (d: Date | string | null | undefined) =>
  d ? (d instanceof Date ? d : new Date(d)).toISOString() : null

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const cliente = req.auth_context.actor_id

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "fulfillments.canceled_at",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
    filters: { id: req.params.id, customer_id: cliente },
  })

  const pedido = data[0] as
    { id: string; fulfillments?: (EnvioDoPedido | null)[] | null } | undefined
  if (!pedido) {
    res.status(404).json({ message: "pedido_nao_encontrado" })
    return
  }

  const envios = await req.scope
    .resolve<EnviosService>(ENVIOS)
    .listEnvios(
      { pedido_id: pedido.id },
      { relations: ["eventos"], order: { created_at: "ASC" }, take: 20 }
    )

  const rastreios: Rastreio[] = envios
    .filter((e) => e.codigo)
    .map((e) => {
      const todos = [...(e.eventos ?? [])]
      const daTransportadora = todos.filter((ev) => ev.origem !== "loja")
      const eventos = (daTransportadora.length ? daTransportadora : todos)
        .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
        .map((ev) => ({
          tipo: ev.tipo,
          descricao: ev.descricao,
          local: ev.local ?? null,
          quando: iso(ev.quando),
        }))
      return {
        codigo: e.codigo as string,
        url: e.url ?? null,
        transportadora: e.transportadora ?? null,
        servico: e.servico ?? null,
        situacao: e.situacao,
        alerta: e.alerta ?? null,
        postadoEm: iso(e.postado_em),
        entregueEm: iso(e.entregue_em),
        eventos,
      }
    })

  const conhecidos = new Set(rastreios.map((r) => r.codigo))
  for (const f of pedido.fulfillments ?? []) {
    if (!f || f.canceled_at) continue
    for (const l of f.labels ?? []) {
      const codigo = limparCodigo(l?.tracking_number)
      if (!codigo || conhecidos.has(codigo)) continue
      conhecidos.add(codigo)
      rastreios.push({
        codigo,
        url: typeof l?.tracking_url === "string" ? l.tracking_url : null,
        transportadora: transportadoraPeloCodigo(codigo),
        servico: null,
        situacao: null,
        alerta: null,
        postadoEm: null,
        entregueEm: null,
        eventos: [],
      })
    }
  }

  res.json({ rastreios })
}
