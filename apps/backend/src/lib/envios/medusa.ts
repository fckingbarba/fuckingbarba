import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import type { SituacaoDoEnvio } from "./situacao"

/**
 * O PEDIDO NO MEDUSA ACOMPANHA O ENVIO.
 *
 * O Medusa tem o próprio jeito de dizer onde o pedido está — o fulfillment,
 * com `shipped_at`, `delivered_at` e as etiquetas (o código de rastreio).
 * É isso que o admin mostra, que a conta usa pro selo "Enviado"/"Entregue",
 * e que qualquer relatório vai ler. Então o envio não guarda a verdade só
 * pra ele: quando o pacote sai, o fulfillment é marcado como enviado COM o
 * código; quando chega, como entregue.
 *
 * ┌─ SÓ O QUE FALTA, SEMPRE PELOS WORKFLOWS DO MEDUSA ─────────────────────┐
 * │ Esta função olha o pedido e faz o que ainda não foi feito — pode rodar │
 * │ quantas vezes for, que o segundo passe não acha nada pra fazer. É isso │
 * │ que deixa o job tentar de novo o que falhou sem medo.                  │
 * │                                                                         │
 * │ E faz pelos mesmos workflows dos botões do admin ("Fulfill items",     │
 * │ "Mark as shipped", "Mark as delivered"): o estoque baixa, os eventos   │
 * │ saem e o pedido fica igual a um que a pessoa marcou à mão. Sempre com  │
 * │ `no_notification`: quem avisa o cliente é o núcleo, uma vez só.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELA NÃO FAZ: mexer em pedido cancelado, ou adivinhar. Se o pedido
 * já saiu com OUTRO código (a segunda caixa? o código digitado errado?), a
 * resposta é a pendência, com o motivo — e o admin decide.
 */

export type EnvioParaSincronizar = {
  pedido_id: string | null
  fulfillment_id: string | null
  codigo: string | null
  url: string | null
  situacao: SituacaoDoEnvio
}

export type Sincronia =
  { ok: true; fez: string[]; fulfillmentId: string | null } | { ok: false; motivo: string }

type Etiqueta = { id: string; tracking_number?: string | null }
type EnvioDoPedido = {
  id: string
  shipped_at?: unknown
  delivered_at?: unknown
  canceled_at?: unknown
  labels?: (Etiqueta | null)[] | null
  items?: ({ line_item_id?: string | null; quantity?: unknown } | null)[] | null
}
type PedidoLido = {
  id: string
  status: string
  items?: ({ id: string; quantity?: unknown } | null)[] | null
  fulfillments?: (EnvioDoPedido | null)[] | null
}

const CAMPOS = [
  "id",
  "status",
  // A quantidade do item do pedido é calculada (vem do `detail`): só sai com o item inteiro.
  "items.*",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.labels.id",
  "fulfillments.labels.tracking_number",
  "fulfillments.items.line_item_id",
  "fulfillments.items.quantity",
]

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoLido | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoLido | undefined) ?? null
}

/** Mesmo código, com a mesma limpeza do núcleo (o admin digita com espaço, minúscula). */
const mesmoCodigo = (a: string | null | undefined, b: string) =>
  (a ?? "").replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase()

export async function sincronizarComMedusa(
  container: MedusaContainer,
  envio: EnvioParaSincronizar
): Promise<Sincronia> {
  const { pedido_id: pedidoId, codigo } = envio
  if (!pedidoId || !codigo || envio.situacao === "aguardando") {
    return { ok: true, fez: [], fulfillmentId: envio.fulfillment_id }
  }

  let pedido = await lerPedido(container, pedidoId)
  if (!pedido) return { ok: false, motivo: "o pedido não existe mais no Medusa" }
  if (pedido.status === "canceled") {
    return { ok: false, motivo: "o pedido está cancelado — o envio não mexe nele" }
  }

  const fez: string[] = []
  const vivos = () =>
    (pedido?.fulfillments ?? []).filter((f): f is EnvioDoPedido => Boolean(f && !f.canceled_at))
  const temOCodigo = (f: EnvioDoPedido) =>
    (f.labels ?? []).some((l) => mesmoCodigo(l?.tracking_number, codigo))

  if (!vivos().length) {
    /*
      NINGUÉM SEPAROU NO ADMIN: o aviso chegou antes do "Fulfill items".
      Separa o pedido inteiro — um pacote que já está na transportadora
      levou tudo o que tinha pra levar.
    */
    const itens = (pedido.items ?? [])
      .filter((i): i is { id: string; quantity?: unknown } => Boolean(i?.id))
      .map((i) => ({ id: i.id, quantity: Number(i.quantity ?? 0) }))
      .filter((i) => i.quantity > 0)
    await createOrderFulfillmentWorkflow(container).run({
      input: { order_id: pedidoId, items: itens, no_notification: true },
    })
    fez.push("separou")
    pedido = await lerPedido(container, pedidoId)
    if (!pedido) return { ok: false, motivo: "o pedido sumiu no meio da separação" }
  }

  let f =
    vivos().find(temOCodigo) ??
    vivos().find((x) => x.id === envio.fulfillment_id) ??
    vivos().find((x) => !x.shipped_at) ??
    null
  if (!f) {
    // Todos já saíram, nenhum com este código. Só um deles sem etiqueta nenhuma? É ele.
    const semEtiqueta = vivos().filter((x) => !(x.labels ?? []).length)
    if (semEtiqueta.length !== 1) {
      return {
        ok: false,
        motivo: "o pedido já foi marcado como enviado com outro código de rastreio",
      }
    }
    f = semEtiqueta[0]!
  }

  const etiqueta = { tracking_number: codigo, tracking_url: envio.url ?? "#", label_url: "#" }
  if (!f.shipped_at) {
    // Os itens do pacote, um por linha do pedido — é o que o botão do admin manda.
    const porLinha = new Map<string, number>()
    for (const i of f.items ?? []) {
      if (i?.line_item_id) {
        porLinha.set(i.line_item_id, (porLinha.get(i.line_item_id) ?? 0) + Number(i.quantity ?? 0))
      }
    }
    await createOrderShipmentWorkflow(container).run({
      input: {
        order_id: pedidoId,
        fulfillment_id: f.id,
        items: [...porLinha].map(([id, quantity]) => ({ id, quantity })),
        labels: [etiqueta],
        no_notification: true,
      },
    })
    fez.push("postou")
  } else if (!temOCodigo(f)) {
    /*
      Já estava como enviado, sem este código: a etiqueta entra junto das que
      existirem (as de `{ id }` ficam; a lista substitui a do fulfillment).
      Direto no módulo, que é o que o workflow de atualizar faria — o tipo
      do workflow é que não deixa passar etiqueta.
    */
    await container.resolve(Modules.FULFILLMENT).updateFulfillment(f.id, {
      labels: [
        ...(f.labels ?? []).filter((l): l is Etiqueta => Boolean(l?.id)).map((l) => ({ id: l.id })),
        etiqueta,
      ],
    })
    fez.push("etiquetou")
  }

  if (envio.situacao === "entregue" && !f.delivered_at) {
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId: pedidoId, fulfillmentId: f.id, no_notification: true },
    })
    fez.push("entregou")
  }

  return { ok: true, fez, fulfillmentId: f.id }
}
