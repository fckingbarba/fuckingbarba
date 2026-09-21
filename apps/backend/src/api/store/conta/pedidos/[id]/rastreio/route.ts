import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/conta/pedidos/:id/rastreio — o código de rastreio de um pedido
 * da conta.
 *
 * EXISTE PORQUE A API DA LOJA NÃO ENTREGA: `/store/orders` devolve os envios
 * do pedido, mas corta as etiquetas (`fulfillments.labels`), que é onde o
 * admin grava o código ao marcar como enviado. Aqui a leitura é pelo `query`
 * de dentro, com o filtro que a rota da loja faria: SÓ pedido do cliente do
 * token. Pedido de outra pessoa responde igual a pedido que não existe — a
 * rota não diz se o id existe.
 *
 * Devolve só o que a tela de pedido mostra: o código e o link, se o admin
 * pôs um. Envio cancelado não conta.
 */

type Envio = {
  canceled_at?: string | Date | null
  shipped_at?: string | Date | null
  labels?: { tracking_number?: string | null; tracking_url?: string | null }[] | null
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const cliente = req.auth_context.actor_id

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
    filters: { id: req.params.id, customer_id: cliente },
  })

  const pedido = data[0] as { fulfillments?: Envio[] | null } | undefined
  if (!pedido) {
    res.status(404).json({ message: "pedido_nao_encontrado" })
    return
  }

  const rastreios = (pedido.fulfillments ?? [])
    .filter((f) => !f.canceled_at)
    .flatMap((f) => f.labels ?? [])
    .filter((l) => typeof l.tracking_number === "string" && l.tracking_number.trim())
    .map((l) => ({
      codigo: String(l.tracking_number).trim(),
      url: typeof l.tracking_url === "string" ? l.tracking_url : null,
    }))

  res.json({ rastreios })
}
