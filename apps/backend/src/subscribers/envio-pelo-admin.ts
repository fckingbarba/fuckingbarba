import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { receberNovidade } from "../lib/envios/nucleo"
import { limparCodigo } from "../lib/envios/situacao"

/**
 * O ADMIN TAMBÉM É UMA PORTA DOS ENVIOS.
 *
 * "Mark as shipped" com o código de rastreio, e "Mark as delivered", no
 * admin do Medusa, entram no núcleo como qualquer aviso — só que a origem
 * é a loja. É o que faz o envio existir mesmo sem o aviso do parceiro: o
 * cliente recebe o e-mail com o código, a conta mostra o rastreio, e o
 * aviso da Frenet que chegar depois com o mesmo código continua a mesma
 * história (em vez de começar outra).
 *
 * E é o que liga o aviso que chegou ANTES: o envio que a Frenet mandou sem
 * pedido conhecido acha o pedido aqui, pelo código.
 *
 * `no_notification` é o "avisar o cliente" do admin (o núcleo marca os
 * próprios passos assim, pra este assinante não mandar e-mail repetido).
 * Postado sem código não tem o que rastrear, e não vira envio.
 */
type Etiqueta = { tracking_number?: string | null; tracking_url?: string | null } | null

export default async function envioPeloAdmin({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: achados } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "shipped_at",
      "delivered_at",
      "canceled_at",
      "labels.tracking_number",
      "labels.tracking_url",
      "order.id",
    ],
    filters: { id: data.id },
  })
  const f = achados[0] as
    | {
        id: string
        shipped_at?: string | Date | null
        delivered_at?: string | Date | null
        canceled_at?: unknown
        labels?: Etiqueta[] | null
        order?: { id?: string } | null
      }
    | undefined
  const pedidoId = f?.order?.id
  if (!f || !pedidoId || f.canceled_at) return

  const entregue = name === "delivery.created"
  const quando = new Date((entregue ? f.delivered_at : f.shipped_at) ?? Date.now())
  for (const etiqueta of f.labels ?? []) {
    const codigo = limparCodigo(etiqueta?.tracking_number)
    if (!codigo) continue
    const url = etiqueta?.tracking_url
    await receberNovidade(
      container,
      {
        pedido: pedidoId,
        idNoParceiro: null,
        codigo,
        // O admin manda "#" quando o campo fica vazio.
        url: url && /^https?:\/\//i.test(url) ? url : null,
        transportadora: null,
        servico: null,
        eventos: [
          entregue
            ? { tipo: "entregue", quando, descricao: "Entregue", local: null }
            : { tipo: "postado", quando, descricao: "Postado", local: null },
        ],
      },
      {
        parceiro: "loja",
        avisarCliente: !data.no_notification,
        pedidoId,
        fulfillmentId: f.id,
      }
    )
  }
}

export const config: SubscriberConfig = {
  event: ["shipment.created", "delivery.created"],
}
