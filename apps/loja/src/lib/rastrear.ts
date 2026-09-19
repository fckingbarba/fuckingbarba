/**
 * A ÚNICA porta de saída de eventos de analytics do front (seção "Tags,
 * analytics e atribuição" da arquitetura).
 *
 * Tudo vai pro `window.dataLayer` no formato de e-commerce do GA4. GA4 lê
 * direto; o Pixel da Meta (fase 3) e um eventual GTM leem da mesma camada.
 * Nenhum componente chama gtag/fbq por conta própria.
 *
 * O `purchase` NÃO é disparado daqui: sai do worker do Medusa quando o
 * pagamento é confirmado (Conversions API + Measurement Protocol).
 */

export type ItemRastreado = {
  item_id: string
  item_name: string
  item_category?: "barba" | "cabelo" | "kits" | (string & {})
  price: number
  quantity?: number
}

type ComItens = { currency: "BRL"; value: number; items: ItemRastreado[] }

export type EventoRastreado =
  | { nome: "view_item_list"; dados: { item_list_name: string; items: ItemRastreado[] } }
  | { nome: "select_item"; dados: { item_list_name: string; items: ItemRastreado[] } }
  | { nome: "view_item"; dados: ComItens }
  | { nome: "add_to_cart"; dados: ComItens }
  | { nome: "remove_from_cart"; dados: ComItens }
  | { nome: "view_cart"; dados: ComItens }
  | { nome: "begin_checkout"; dados: ComItens }
  | { nome: "add_shipping_info"; dados: ComItens & { shipping_tier: string } }
  | { nome: "add_payment_info"; dados: ComItens & { payment_type: "pix" | "cartao" | "boleto" } }
  // Próprios da loja — as alavancas de ticket médio que vale acompanhar.
  | { nome: "frete_gratis_atingido"; dados: { value: number } }
  | { nome: "cupom_aplicado"; dados: { coupon: string } }
  | { nome: "pix_copiado"; dados: { value: number } }
  | { nome: "order_bump_aceito"; dados: ComItens }
  | { nome: "sugestao_adicionada"; dados: ComItens }
  | { nome: "consentimento"; dados: { marketing: boolean } }

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

export function rastrear<E extends EventoRastreado>(nome: E["nome"], dados: E["dados"]): void {
  if (typeof window === "undefined") return
  window.dataLayer = window.dataLayer ?? []
  // GA4 recomenda limpar o objeto de e-commerce antes de cada evento novo.
  if ("items" in dados) window.dataLayer.push({ ecommerce: null })
  window.dataLayer.push({
    event: nome,
    ...("items" in dados ? { ecommerce: dados } : dados),
  })
  if (process.env.NODE_ENV !== "production") {
    console.debug("[rastrear]", nome, dados)
  }
}
