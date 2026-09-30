/**
 * OS PASSOS DA VISITA PELO SERVIDOR — a visita à página, o produto visto, a
 * sacola, o começo do checkout e a forma de pagamento, pra Meta (API de
 * Conversões) e pro TikTok (Events API), além do pixel no navegador
 * (entrega 0231: pedido do dono, pros gestores de tráfego não perderem quem
 * usa bloqueador). Quem manda é a loja (`/api/passos` →
 * `POST /store/anuncios/passos`); código puro, com testes.
 *
 * DOIS JEITOS, conforme o passo:
 * - O PRODUTO, A SACOLA, O CHECKOUT E O PAGAMENTO vão pelo servidor pra todo
 *   mundo que não recusou os cookies, com o MESMO `event_id` que o pixel
 *   manda do navegador: a Meta e o TikTok contam uma vez só quando chegam os
 *   dois, e contam o do servidor quando o pixel foi bloqueado.
 * - A VISITA À PÁGINA (PageView) só vai pelo servidor de quem teve o pixel
 *   bloqueado: a do pixel sai sozinha a cada troca de página, sem um
 *   `event_id` que a loja conheça, e mandar a do servidor pra todo mundo
 *   contaria duas vezes.
 *
 * O GA4 FICA DE FORA: ele não junta o do navegador com o do servidor, e o
 * Measurement Protocol não cria visita — o Início e o Marketing do painel
 * leem o GA4 e contariam dobrado. A compra já vai pra ele pelo servidor
 * (`compra.ts`).
 *
 * O QUE CHEGA É CONFERIDO CAMPO A CAMPO, porque a rota da loja é pública e o
 * que passa vai pra dentro da chamada de outra empresa: o nome do passo, o
 * `event_id`, a página (só da loja, e só o caminho — sem a busca), os itens,
 * o valor e o horário.
 */

export type NomeDoPasso =
  "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo"
export type Destino = "meta" | "tiktok"

const NOMES: NomeDoPasso[] = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
]
const DESTINOS: Destino[] = ["meta", "tiktok"]

/** O nome no TikTok: a visita à página lá se chama "Pageview"; o resto é igual. */
const NO_TIKTOK: Record<NomeDoPasso, string> = {
  PageView: "Pageview",
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
}

export type ItemDoPasso = { id: string; nome: string; quantidade: number; preco: number }

export type Passo = {
  nome: NomeDoPasso
  /** O mesmo do pixel: é por ele que a plataforma junta os dois. */
  id: string
  /** Só a loja e o caminho: `https://www.fuckingbarba.com.br/produtos/oleo`. */
  pagina: string
  /** Segundos. */
  em: number
  para: Destino[]
  valor: number | null
  itens: ItemDoPasso[]
}

/** Quem visitou, do jeito que a loja leu (os cookies, o IP, o navegador). */
export type Quem = {
  ip: string | null
  navegador: string | null
  fbp: string | null
  fbc: string | null
  ttp: string | null
  ttclid: string | null
}

export const MAX_PASSOS = 20
const MAX_ITENS = 30
/** A Meta recusa o lote inteiro com evento de mais de 7 dias; aqui, uma hora já é demais. */
const ATRASO_MAXIMO_S = 60 * 60

const ID = /^[A-Za-z0-9_-]{8,64}$/
const ID_DO_ITEM = /^[A-Za-z0-9_-]{1,64}$/
/** O que pode ir de cookie: sem espaço, aspas ou controle. */
const DE_COOKIE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/
const DA_META = /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:.]{2,45})$/

const texto = (v: unknown, formato: RegExp, max: number): string | null =>
  typeof v === "string" && v.length <= max && formato.test(v) ? v : null

const centavos = (v: number) => Math.round(v * 100) / 100

const numero = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null

/** A página, se for da loja: fica só a origem e o caminho. */
function paginaDaLoja(v: unknown, dominio: string | null): string | null {
  if (typeof v !== "string" || v.length > 2000) return null
  try {
    const u = new URL(v)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    const host = u.hostname.replace(/^www\./, "")
    if (dominio && host !== dominio.replace(/^www\./, "")) return null
    return `${u.origin}${u.pathname}`.slice(0, 500)
  } catch {
    return null
  }
}

function itensDe(v: unknown): ItemDoPasso[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, MAX_ITENS).flatMap((bruto): ItemDoPasso[] => {
    const i = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
    const id = texto(i.id, ID_DO_ITEM, 64)
    const quantidade = numero(i.quantidade, 999)
    const preco = numero(i.preco, 100_000)
    if (!id || !quantidade || !Number.isInteger(quantidade) || preco === null) return []
    const nome = typeof i.nome === "string" ? i.nome.slice(0, 100) : ""
    return [{ id, nome, quantidade, preco: centavos(preco) }]
  })
}

/**
 * O lote que a loja mandou, lido com desconfiança: o que não passa sai
 * (passo a passo), e o lote nunca passa de 20. `dominio`: o da loja
 * (`LOJA_URL`); sem ele, qualquer página serve (desenvolvimento).
 */
export function lerPassos(bruto: unknown, dominio: string | null, agora = Date.now()): Passo[] {
  if (!Array.isArray(bruto)) return []
  const agoraS = Math.floor(agora / 1000)
  const vistos = new Set<string>()
  return bruto.slice(0, MAX_PASSOS).flatMap((b): Passo[] => {
    const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>
    const nome = NOMES.find((n) => n === o.nome)
    const id = texto(o.id, ID, 64)
    const pagina = paginaDaLoja(o.pagina, dominio)
    const para = Array.isArray(o.para)
      ? DESTINOS.filter((d) => (o.para as unknown[]).includes(d))
      : []
    if (!nome || !id || !pagina || !para.length || vistos.has(id)) return []
    vistos.add(id)
    const em = numero(o.em, agoraS + 60)
    const valor = numero(o.valor, 100_000)
    return [
      {
        nome,
        id,
        pagina,
        em:
          em === null
            ? agoraS
            : Math.min(agoraS, Math.max(Math.floor(em), agoraS - ATRASO_MAXIMO_S)),
        para,
        valor: nome === "PageView" || valor === null ? null : centavos(valor),
        itens: nome === "PageView" ? [] : itensDe(o.itens),
      },
    ]
  })
}

/** Os cookies e o aparelho de quem visitou, conferidos um a um. */
export function lerQuem(bruto: unknown): Quem {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  return {
    ip: texto(o.ip, IP, 45),
    navegador: typeof o.navegador === "string" ? o.navegador.slice(0, 500) || null : null,
    fbp: texto(o.fbp, DA_META, 300),
    fbc: texto(o.fbc, DA_META, 600),
    ttp: texto(o.ttp, DE_COOKIE, 200),
    ttclid: texto(o.ttclid, DE_COOKIE, 500),
  }
}

/** Tira as chaves vazias: a plataforma recusa campo nulo em vez de ignorar. */
function limpo<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")
  ) as Partial<T>
}

const quantos = (p: Passo) => p.itens.reduce((s, i) => s + i.quantidade, 0)

/** O lote da Meta (API de Conversões), ou nulo se nenhum passo é pra ela. */
export function passosPraMeta(passos: Passo[], quem: Quem, teste?: string | null) {
  const dela = passos.filter((p) => p.para.includes("meta"))
  if (!dela.length) return null
  const usuario = limpo({
    fbp: quem.fbp,
    fbc: quem.fbc,
    client_ip_address: quem.ip,
    client_user_agent: quem.navegador,
  })
  return limpo({
    data: dela.map((p) =>
      limpo({
        event_name: p.nome,
        event_time: p.em,
        event_id: p.id,
        action_source: "website",
        event_source_url: p.pagina,
        user_data: usuario,
        custom_data:
          p.nome === "PageView"
            ? null
            : limpo({
                currency: "BRL",
                value: p.valor,
                content_type: "product",
                content_ids: p.itens.map((i) => i.id),
                contents: p.itens.map((i) => ({
                  id: i.id,
                  quantity: i.quantidade,
                  item_price: i.preco,
                })),
                num_items: p.nome === "InitiateCheckout" ? quantos(p) : null,
              }),
      })
    ),
    test_event_code: teste || null,
  })
}

/** O lote do TikTok (Events API), ou nulo se nenhum passo é pra ele. */
export function passosPraTiktok(passos: Passo[], quem: Quem, pixel: string, teste?: string | null) {
  const dele = passos.filter((p) => p.para.includes("tiktok"))
  if (!dele.length) return null
  const usuario = limpo({
    ttp: quem.ttp,
    ttclid: quem.ttclid,
    ip: quem.ip,
    user_agent: quem.navegador,
  })
  return limpo({
    event_source: "web",
    event_source_id: pixel,
    test_event_code: teste || null,
    data: dele.map((p) =>
      limpo({
        event: NO_TIKTOK[p.nome],
        event_time: p.em,
        event_id: p.id,
        user: usuario,
        page: { url: p.pagina },
        properties:
          p.nome === "PageView"
            ? null
            : limpo({
                currency: "BRL",
                value: p.valor,
                content_type: "product",
                contents: p.itens.map((i) => ({
                  content_id: i.id,
                  content_name: i.nome,
                  quantity: i.quantidade,
                  price: i.preco,
                })),
              }),
      })
    ),
  })
}
