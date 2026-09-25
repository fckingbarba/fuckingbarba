import { createHash } from "node:crypto"
import { idsDoGa, type Parceiro, type Rastro } from "./rastro"

/**
 * A COMPRA PRA CADA PLATAFORMA — o que vai pra Meta (API de Conversões), pro
 * GA4 (Measurement Protocol) e pro TikTok (Events API) quando o pagamento
 * entra, e a decisão de mandar ou não. Código puro, com testes; quem chama e
 * grava é `enviar.ts`.
 *
 * O MESMO ID EM TODA PARTE: o id do pedido é o `event_id` da Meta e do
 * TikTok e o `transaction_id` do GA4 — a plataforma descarta a repetida
 * (o aviso do Pagar.me e a conciliação passam pelo mesmo pagamento), e é o
 * mesmo `transaction_id` que a tela de obrigado manda pro Google Ads.
 *
 * O E-MAIL E O TELEFONE VÃO EMBARALHADOS (SHA-256), e cada um do jeito da
 * plataforma: a Meta quer o telefone só com dígitos ("5511987654321"); o
 * TikTok, com o "+" ("+5511987654321"). O GA4 não recebe nenhum dos dois.
 */

export type Plataforma = "meta" | "ga4" | "tiktok"
export const PLATAFORMAS: Plataforma[] = ["meta", "ga4", "tiktok"]

/** Quem, na faixa de cookies, precisa ter ouvido o sim. */
const PARCEIRO: Record<Plataforma, Parceiro> = { meta: "meta", ga4: "google", tiktok: "tiktok" }

export const NOME_DA_PLATAFORMA: Record<Plataforma, string> = {
  meta: "Meta",
  ga4: "GA4",
  tiktok: "TikTok",
}

export type PedidoDaCompra = {
  id: string
  numero: number
  email: string | null
  telefone: string | null
  /** O que foi cobrado, em reais (com o cupom). */
  total: number
  frete: number
  cupom: string | null
  itens: { id: string; nome: string; quantidade: number; preco: number }[]
  /** Quando o pagamento entrou. */
  pagoEm: Date
}

/** O que ficou gravado de cada plataforma, no pedido (`fb_anuncios.compra`). */
export type RegistroDaCompra = {
  em: string
  como: "enviada" | "dispensada" | "recusada"
  motivo?: string
}

/** Sem rastro, a compra espera a loja mandar, até isto; depois, desiste. */
export const ESPERA_PELO_RASTRO_MS = 30 * 60 * 1000

export type Decisao = "mandar" | "esperar" | "nada" | { dispensar: string }

/**
 * Mandar, esperar ou deixar pra lá — por plataforma.
 * - já feita, ou a plataforma sem o código (painel) ou sem a chave (Railway):
 *   nada, e nada é gravado (ligada depois, a varredura das últimas 24 horas
 *   ainda pega);
 * - sem o rastro da loja: espera meia hora (ela manda logo depois de fechar
 *   o pedido); passou disso, dispensa;
 * - sem o sim, ou sem o sim PRA ESTA plataforma: dispensa;
 * - o GA4 sem o `client_id` do cookie dele: dispensa (não há a quem somar).
 */
export function decidir(
  plataforma: Plataforma,
  {
    codigo,
    chave,
    rastro,
    feito,
    idadeMs,
  }: {
    codigo: string | null
    chave: boolean
    rastro: Rastro | null
    feito: RegistroDaCompra | undefined
    idadeMs: number
  }
): Decisao {
  if (feito || !codigo || !chave) return "nada"
  if (!rastro) return idadeMs < ESPERA_PELO_RASTRO_MS ? "esperar" : { dispensar: "sem-rastro" }
  if (rastro.consentimento !== "sim") return { dispensar: "sem-consentimento" }
  if (!rastro.parceiros.includes(PARCEIRO[plataforma])) return { dispensar: "parceiro-sem-sim" }
  if (plataforma === "ga4" && !idsDoGa(rastro.ga).clientId) return { dispensar: "sem-client-id" }
  return "mandar"
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

export const emailNormalizado = (e: string | null) => {
  const v = (e ?? "").trim().toLowerCase()
  return v.includes("@") ? v : null
}

/** Só dígitos, com o 55 na frente: "5511987654321". Nulo se não parece telefone. */
export function telefoneComPais(t: string | null): string | null {
  const d = (t ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Segundos, e nunca no futuro nem além de 7 dias (a Meta recusa o lote inteiro). */
function momento(p: PedidoDaCompra, agora: Date): number {
  const pago = Math.min(p.pagoEm.getTime(), agora.getTime())
  return Math.floor(Math.max(pago, agora.getTime() - 6 * 24 * 3600 * 1000) / 1000)
}

/** Tira as chaves vazias: a plataforma recusa campo nulo em vez de ignorar. */
function limpo<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")
  ) as Partial<T>
}

export function compraPraMeta(p: PedidoDaCompra, r: Rastro, agora: Date, teste?: string | null) {
  const email = emailNormalizado(p.email)
  const telefone = telefoneComPais(p.telefone)
  return limpo({
    data: [
      limpo({
        event_name: "Purchase",
        event_time: momento(p, agora),
        event_id: p.id,
        action_source: "website",
        event_source_url: r.pagina,
        user_data: limpo({
          em: email ? [sha256(email)] : null,
          ph: telefone ? [sha256(telefone)] : null,
          fbp: r.meta?.fbp,
          fbc: r.meta?.fbc,
          client_ip_address: r.ip,
          client_user_agent: r.navegador,
        }),
        custom_data: {
          currency: "BRL",
          value: centavos(p.total),
          order_id: p.id,
          content_type: "product",
          content_ids: p.itens.map((i) => i.id),
          contents: p.itens.map((i) => ({
            id: i.id,
            quantity: i.quantidade,
            item_price: centavos(i.preco),
          })),
          num_items: p.itens.reduce((s, i) => s + i.quantidade, 0),
        },
      }),
    ],
    test_event_code: teste || null,
  })
}

export function compraProGa4(p: PedidoDaCompra, r: Rastro, agora: Date) {
  const { clientId, sessionId } = idsDoGa(r.ga)
  if (!clientId) return null
  return {
    client_id: clientId,
    // Até 72 horas pra trás; a varredura só olha as últimas 24.
    timestamp_micros: momento(p, agora) * 1_000_000,
    // Só vai de quem disse sim ao Google na faixa (`decidir`).
    consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" },
    events: [
      {
        name: "purchase",
        params: limpo({
          transaction_id: p.id,
          value: centavos(p.total),
          currency: "BRL",
          shipping: centavos(p.frete),
          coupon: p.cupom,
          session_id: sessionId,
          engagement_time_msec: 1,
          items: p.itens.map((i) => ({
            item_id: i.id,
            item_name: i.nome.slice(0, 100),
            price: centavos(i.preco),
            quantity: i.quantidade,
          })),
        }),
      },
    ],
  }
}

export function compraPraTiktok(
  p: PedidoDaCompra,
  r: Rastro,
  pixel: string,
  agora: Date,
  teste?: string | null
) {
  const email = emailNormalizado(p.email)
  const telefone = telefoneComPais(p.telefone)
  return limpo({
    event_source: "web",
    event_source_id: pixel,
    test_event_code: teste || null,
    data: [
      limpo({
        event: "Purchase",
        event_time: momento(p, agora),
        event_id: p.id,
        user: limpo({
          email: email ? sha256(email) : null,
          phone: telefone ? sha256(`+${telefone}`) : null,
          ttp: r.tiktok?.ttp,
          ip: r.ip,
          user_agent: r.navegador,
        }),
        properties: {
          currency: "BRL",
          value: centavos(p.total),
          order_id: p.id,
          content_type: "product",
          contents: p.itens.map((i) => ({
            content_id: i.id,
            content_name: i.nome.slice(0, 100),
            quantity: i.quantidade,
            price: centavos(i.preco),
          })),
        },
        page: r.pagina ? { url: r.pagina } : null,
      }),
    ],
  })
}
