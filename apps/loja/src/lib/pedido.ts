import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import type { ItemDoCarrinho } from "./carrinho-visivel"
import { mascararCep } from "./cep-formato"
import { COOKIE_PEDIDO, lerCracha } from "./checkout"
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
 * cai — e por isso é leve, sem itens nem endereço. Cabe na versão pública
 * do pedido, então não precisa do crachá.
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
  "discount_total,shipping_total,total,credit_line_total,*items,*items.variant,*items.product," +
  `*shipping_methods,*shipping_address,${CAMPOS_DO_PAGAMENTO}`

/** O que a versão pública do pedido tem — ver `lerPedido`. */
const CAMPOS_PUBLICOS = "id,display_id,status,payment_status,*payment_collections.payment_sessions"

/** O cabeçalho em que o Medusa lê o carrinho do crachá (`lib/pedido-publico.ts` de lá). */
const CABECALHO_DO_CARRINHO = "x-carrinho"

async function crachaDo(pedidoId: string) {
  const cracha = lerCracha((await cookies()).get(COOKIE_PEDIDO)?.value)
  return cracha?.pedido === pedidoId ? cracha : null
}

/**
 * O crachá deste navegador diz que é deste pedido? É só o que o COOKIE diz
 * — quem prova é o Medusa, no `lerPedido`. Serve pra pergunta do Pix (ver
 * `acoes/pedido.ts`), cuja resposta é pública de qualquer jeito.
 */
export async function ehDeQuemComprou(pedidoId: string): Promise<boolean> {
  return Boolean(await crachaDo(pedidoId))
}

export type LeituraDoPedido = {
  pedido: PedidoVisivel
  /** O Medusa reconheceu o crachá: pode mostrar endereço, e-mail e o QR do Pix. */
  meu: boolean
}

/**
 * O pedido da tela de obrigado — inteiro pra quem comprou, e só número e
 * situação pra quem tem o link.
 *
 * QUEM DECIDE É O MEDUSA. A loja mostra o carrinho do crachá; se ele é o do
 * pedido, volta o pedido inteiro. Se não é (crachá forjado), 403 — e a
 * leitura segue sem ele, como a de qualquer visita. Sem crachá, ou com o de
 * antes (só o id do pedido, sem carrinho), vai direto pra versão pública.
 */
export async function lerPedido(id: string): Promise<LeituraDoPedido | null> {
  const sdk = cliente()
  if (!sdk) return null

  const carrinho = (await crachaDo(id))?.carrinho
  if (carrinho) {
    try {
      const { order } = await sdk.store.order.retrieve(
        id,
        { fields: CAMPOS_DO_PEDIDO },
        { [CABECALHO_DO_CARRINHO]: carrinho }
      )
      if (order) return { pedido: paraPedidoVisivel(order), meu: true }
    } catch (erro) {
      if ((erro as { status?: number })?.status !== 403) {
        console.warn(`[pedido] ${id}: ${erro instanceof Error ? erro.message : String(erro)}`)
        return null
      }
      console.warn(`[pedido] ${id}: o Medusa recusou o crachá — mostrando a versão pública`)
    }
  }

  try {
    const { order } = await sdk.store.order.retrieve(id, { fields: CAMPOS_PUBLICOS })
    return order ? { pedido: paraPedidoVisivel(order), meu: false } : null
  } catch (erro) {
    console.warn(`[pedido] ${id}: ${erro instanceof Error ? erro.message : String(erro)}`)
    return null
  }
}

/**
 * O TOTAL DO PEDIDO É O QUE FOI COBRADO — com o cupom e a oferta do checkout
 * descontados, cancelado ou não. Dois números do Medusa parecem servir, e
 * nenhum serve sozinho:
 *
 * - o `total` é o que SOBROU: cancelar um pedido pago grava a devolução como
 *   crédito (`credit_line_total`), que desconta — o estornado inteiro daria
 *   R$ 0,00. Por isso o crédito volta pra conta;
 * - o `original_total` é a conta de ANTES dos descontos: o cancelado cobrado
 *   R$ 153,01 aparecia como R$ 158,50, logo abaixo do "Desconto −R$ 5,49".
 *
 * Arredondado no centavo como o Pagar.me cobra (`emCentavos`, no provedor do
 * backend): a oferta é 10% de uma unidade, e o Medusa guarda fração de
 * centavo. É a mesma conta do painel e do e-mail de cancelamento.
 */
function totalCobrado(order: HttpTypes.StoreOrder): number {
  const reais = Number(order.total ?? 0) + Number(order.credit_line_total ?? 0)
  return Math.round(reais * 100) / 100
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
    total: totalCobrado(order),
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
