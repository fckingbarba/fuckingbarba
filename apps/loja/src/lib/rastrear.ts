/**
 * A ÚNICA porta de saída de eventos de analytics do front (seção "Tags,
 * analytics e atribuição" da arquitetura). Nenhum componente chama
 * gtag/fbq/ttq por conta própria.
 *
 * O evento sai no formato de e-commerce do GA4 e cada parceiro recebe a sua
 * tradução: o GA4 e o Google Ads pelo `gtag('event', …)` — o `dataLayer.push`
 * de objeto, sem GTM, o gtag.js ignora (conferido em 25/09) —, a Meta e o
 * TikTok pelos eventos padrão deles (ViewContent, AddToCart,
 * InitiateCheckout, AddPaymentInfo) e a Clarity como marca na gravação.
 *
 * SEM O "ACEITAR", NÃO SAI NADA: as funções dos parceiros só existem depois
 * que `components/analytics/integracoes.ts` monta as tags. Até lá o evento
 * espera na memória da página (`fila`, com teto) — a visita ao produto
 * acontece no mesmo instante em que as tags ligam, e o efeito do produto
 * roda antes do das tags. Com o sim, a fila sai (`integracoesLigadas`); sem
 * ele, morre com a página, sem ter saído do navegador.
 *
 * O `purchase` NÃO é disparado daqui: sai do servidor quando o pagamento
 * entra (`apps/backend/src/lib/anuncios/`), pra contar o Pix pago depois e
 * quem usa bloqueador. A exceção é a conversão do Google Ads, que não tem
 * caminho pelo servidor: `converterCompraNoGoogleAds`, na tela de obrigado.
 *
 * O `item_id` é o id da variante no Medusa — o mesmo que o servidor manda na
 * compra, pra plataforma casar a visita, a sacola e a compra.
 */

export type ItemRastreado = {
  item_id: string
  item_name: string
  item_variant?: string
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
  | { nome: "add_payment_info"; dados: ComItens & { payment_type: "pix" | "cartao" } }
  // Próprios da loja — as alavancas de ticket médio que vale acompanhar.
  | { nome: "frete_gratis_atingido"; dados: { value: number } }
  | { nome: "cupom_aplicado"; dados: { coupon: string } }
  | { nome: "pix_copiado"; dados: { value: number } }
  | { nome: "order_bump_aceito"; dados: ComItens }
  | { nome: "sugestao_adicionada"; dados: ComItens }
  | { nome: "consentimento"; dados: { marketing: boolean } }

type Chamada = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Chamada
    fbq?: Chamada
    ttq?: { track: Chamada }
    clarity?: Chamada
  }
}

/** O nome do evento padrão na Meta e no TikTok (são os mesmos). */
const PADRAO_DAS_REDES: Partial<Record<EventoRastreado["nome"], string>> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
}

/** Os que viram marca na gravação da Clarity — pra achar a sessão que chegou ali. */
const NA_CLARITY = new Set<EventoRastreado["nome"]>([
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "pix_copiado",
  "cupom_aplicado",
])

const comItens = (d: object): d is ComItens => "items" in d && "value" in d

const FILA_MAXIMA = 30
let ligadas = false
const fila: (() => void)[] = []

/** Agora, se as tags já ligaram; senão, quando ligarem (com teto). */
function quandoLigadas(fazer: () => void) {
  if (ligadas) fazer()
  else if (fila.length < FILA_MAXIMA) fila.push(fazer)
}

/** As tags acabaram de ligar (depois do "Aceitar"): sai o que estava esperando. */
export function integracoesLigadas() {
  ligadas = true
  for (const fazer of fila.splice(0)) fazer()
}

export function rastrear<E extends EventoRastreado>(nome: E["nome"], dados: E["dados"]): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV !== "production") {
    console.debug("[rastrear]", nome, dados)
  }
  quandoLigadas(() => mandar(nome, dados))
}

function mandar(nome: EventoRastreado["nome"], dados: EventoRastreado["dados"]) {
  const w = window

  w.gtag?.("event", nome, dados)

  const padrao = PADRAO_DAS_REDES[nome]
  if (padrao && comItens(dados)) {
    const quantidade = (i: ItemRastreado) => i.quantity ?? 1
    w.fbq?.("track", padrao, {
      content_ids: dados.items.map((i) => i.item_id),
      contents: dados.items.map((i) => ({
        id: i.item_id,
        quantity: quantidade(i),
        item_price: i.price,
      })),
      content_type: "product",
      value: dados.value,
      currency: dados.currency,
      ...(nome === "begin_checkout"
        ? { num_items: dados.items.reduce((s, i) => s + quantidade(i), 0) }
        : {}),
    })
    w.ttq?.track(padrao, {
      contents: dados.items.map((i) => ({
        content_id: i.item_id,
        content_name: i.item_name,
        quantity: quantidade(i),
        price: i.price,
      })),
      content_type: "product",
      value: dados.value,
      currency: dados.currency,
    })
  }

  if (NA_CLARITY.has(nome)) w.clarity?.("event", nome)
}

/** A linha da sacola, como o rastreio precisa dela (`ItemDoCarrinho`). */
type LinhaDaSacola = {
  varianteId: string
  nome: string
  variante: string | null
  precoUnitario: number
  quantidade: number
}

export const itemRastreado = (l: LinhaDaSacola, quantidade = l.quantidade): ItemRastreado => ({
  item_id: l.varianteId,
  item_name: l.nome,
  ...(l.variante ? { item_variant: l.variante } : {}),
  price: l.precoUnitario,
  quantity: quantidade,
})

/** A sacola inteira como evento de e-commerce (o checkout, a gaveta). */
export function comASacola(itens: LinhaDaSacola[]): ComItens {
  return {
    currency: "BRL",
    value: Math.round(itens.reduce((s, l) => s + l.precoUnitario * l.quantidade, 0) * 100) / 100,
    items: itens.map((l) => itemRastreado(l)),
  }
}

/**
 * O QUE ENTROU E O QUE SAIU DA SACOLA — pela diferença entre a sacola de
 * antes e a que o servidor devolveu. Mora no provedor da sacola, e não em
 * cada botão: a página do produto, o "leva junto", a oferta do checkout, o
 * "comprar de novo" da conta e o "+" da gaveta passam todos por lá.
 */
export function rastrearMudancaDaSacola(antes: LinhaDaSacola[], depois: LinhaDaSacola[]) {
  const soma = (l: LinhaDaSacola[]) => {
    const m = new Map<string, LinhaDaSacola>()
    for (const x of l) {
      const ja = m.get(x.varianteId)
      m.set(x.varianteId, ja ? { ...ja, quantidade: ja.quantidade + x.quantidade } : { ...x })
    }
    return m
  }
  const a = soma(antes)
  const d = soma(depois)
  const entrou: ItemRastreado[] = []
  const saiu: ItemRastreado[] = []
  for (const [id, l] of d) {
    const delta = l.quantidade - (a.get(id)?.quantidade ?? 0)
    if (delta > 0) entrou.push(itemRastreado(l, delta))
  }
  for (const [id, l] of a) {
    const delta = l.quantidade - (d.get(id)?.quantidade ?? 0)
    if (delta > 0) saiu.push(itemRastreado(l, delta))
  }
  const valor = (itens: ItemRastreado[]) =>
    Math.round(itens.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0) * 100) / 100
  if (entrou.length)
    rastrear("add_to_cart", { currency: "BRL", value: valor(entrou), items: entrou })
  if (saiu.length)
    rastrear("remove_from_cart", { currency: "BRL", value: valor(saiu), items: saiu })
}

/**
 * A CONVERSÃO DE COMPRA DO GOOGLE ADS — da tela de obrigado, quando o
 * pagamento entrou. O Google Ads não recebe compra do servidor sem a API
 * dele (conta de desenvolvedor, OAuth); o `transaction_id` faz o Google
 * descartar a repetida, e a marca na sessão evita mandar de novo a cada
 * recarga. O Pix pago com a tela fechada não conta aqui.
 */
export function converterCompraNoGoogleAds(
  envio: string,
  pedido: { id: string; total: number }
): void {
  if (typeof window === "undefined") return
  quandoLigadas(() => {
    if (!window.gtag) return
    const marca = `fb_conversao_ads:${pedido.id}`
    try {
      if (sessionStorage.getItem(marca)) return
      sessionStorage.setItem(marca, "1")
    } catch {
      // sem sessionStorage (aba anônima travada): o transaction_id segura a repetida
    }
    window.gtag("event", "conversion", {
      send_to: envio,
      value: pedido.total,
      currency: "BRL",
      transaction_id: pedido.id,
    })
  })
}
