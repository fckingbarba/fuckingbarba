import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import type { ItemDoCarrinho } from "./carrinho-visivel"
import { mascararCep } from "./cep-formato"
import { COOKIE_PEDIDO } from "./checkout"
import type { PagamentoVisivel } from "./checkout-visivel"
import { cliente } from "./medusa"
import { CAMPOS_DO_PAGAMENTO, lerPagamento } from "./pagamento"

/**
 * O PEDIDO FECHADO
 *
 * Leitura só. Depois do `complete` o pedido é do Medusa e a loja não mexe mais
 * nele — o que muda dali pra frente (pagamento, separação, envio) muda lá.
 */

/**
 * Só o que muda depois do pedido fechado: se foi pago, se foi cancelado. É
 * o que a tela de obrigado pergunta de tempos em tempos enquanto o Pix não
 * cai — e por isso é leve, sem itens nem endereço.
 */
export async function situacaoDoPedido(
  id: string
): Promise<{ pago: boolean; cancelado: boolean } | null> {
  const sdk = cliente()
  if (!sdk) return null
  try {
    const { order } = await sdk.store.order.retrieve(id, { fields: "id,status,payment_status" })
    if (!order) return null
    return {
      pago: order.payment_status === "captured" || order.payment_status === "authorized",
      cancelado: order.status === "canceled",
    }
  } catch {
    return null
  }
}

export type PedidoVisivel = {
  id: string
  /** O número curto, que é o que a pessoa vai dizer no WhatsApp. */
  numero: number
  email: string
  quando: string
  itens: ItemDoCarrinho[]
  subtotal: number
  desconto: number
  frete: number
  total: number
  entrega: {
    nome: string
    linha1: string
    linha2: string
    cidade: string
    uf: string
    cep: string
  } | null
  formaDeEntrega: string
  /**
   * O Pix esperando, o cartão aprovado, o pedido cancelado — ver
   * `lerPagamento`. Os dados do Pix e do cartão são da sessão de pagamento,
   * que o provedor limpou de dado pessoal quando o pedido nasceu.
   */
  pagamento: PagamentoVisivel
}

/** Os campos que a tela de obrigado (e a conta, com mais alguns) lê do pedido. */
export const CAMPOS_DO_PEDIDO =
  "id,display_id,email,created_at,currency_code,subtotal,item_subtotal,item_total," +
  "discount_total,shipping_total,total,original_total,*items,*items.variant,*items.product," +
  `*shipping_methods,*shipping_address,${CAMPOS_DO_PAGAMENTO}`

/**
 * Quem acabou de comprar vê o pedido inteiro; quem só tem o link, não.
 *
 * O id é imprevisível, mas "imprevisível" não é "privado" — URL vaza em
 * histórico, print, grupo de família. E esta tela mostra endereço completo.
 * O cookie é a diferença entre "você comprou isto" e "alguém comprou isto".
 */
export async function ehDeQuemComprou(pedidoId: string): Promise<boolean> {
  return (await cookies()).get(COOKIE_PEDIDO)?.value === pedidoId
}

export async function lerPedido(id: string): Promise<PedidoVisivel | null> {
  const sdk = cliente()
  if (!sdk) return null

  try {
    const { order } = await sdk.store.order.retrieve(id, { fields: CAMPOS_DO_PEDIDO })
    return order ? paraPedidoVisivel(order) : null
  } catch (erro) {
    console.warn(`[pedido] ${id}: ${erro instanceof Error ? erro.message : String(erro)}`)
    return null
  }
}

/**
 * O pedido do Medusa no formato das telas. Uma tradução só, pra tela de
 * obrigado e pra conta: o mesmo pedido não pode aparecer com um total num
 * lugar e outro no outro.
 */
export function paraPedidoVisivel(order: HttpTypes.StoreOrder): PedidoVisivel {
  const itens: ItemDoCarrinho[] = (order.items ?? []).map((item) => ({
    id: item.id,
    varianteId: item.variant_id ?? "",
    nome: item.product_title ?? item.title ?? "Produto",
    variante: item.variant_title && item.variant_title !== "Único" ? item.variant_title : null,
    handle: item.product_handle ?? null,
    imagem: item.thumbnail ?? null,
    quantidade: item.quantity ?? 0,
    precoUnitario: Number(item.unit_price ?? 0),
    total: Number(item.total ?? 0),
  }))

  const e = order.shipping_address
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")

  return {
    id: order.id,
    numero: order.display_id ?? 0,
    email: order.email ?? "",
    quando: order.created_at ? String(order.created_at) : "",
    itens,
    subtotal: Number(order.item_subtotal ?? order.subtotal ?? 0),
    desconto: Number(order.discount_total ?? 0),
    frete: Number(order.shipping_total ?? 0),
    // Pedido cancelado e estornado tem `total` zero (o estorno entra como
    // crédito e zera a conta). O que a pessoa quer ver é quanto ele era.
    total: Number((order.status === "canceled" ? order.original_total : null) ?? order.total ?? 0),
    entrega: e
      ? {
          nome: [e.first_name, e.last_name].filter(Boolean).join(" "),
          linha1: e.address_1 ?? "",
          // Bairro e complemento foram gravados juntos em `address_2` pra
          // etiqueta sair legível; o metadata guarda os dois separados, e é
          // dele que esta tela se serve quando existe.
          linha2:
            [s(meta.complemento), s(meta.bairro)].filter(Boolean).join(" — ") ||
            (e.address_2 ?? ""),
          cidade: e.city ?? "",
          uf: (e.province ?? "").toUpperCase(),
          // Com máscara: o CEP é guardado limpo (é o que o Medusa e o
          // Frenet querem), mas ninguém lê 01310100 sem contar os dígitos.
          cep: mascararCep(e.postal_code ?? ""),
        }
      : null,
    formaDeEntrega: order.shipping_methods?.[0]?.name ?? "",
    pagamento: lerPagamento(order),
  }
}
