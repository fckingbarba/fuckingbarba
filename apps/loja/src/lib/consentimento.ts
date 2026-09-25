import type { Integracoes } from "@/lib/configuracoes"

/**
 * A RESPOSTA SOBRE OS COOKIES — o que a faixa grava e quem lê: o navegador
 * (`components/analytics/`, que só liga as tags com "sim") e o checkout (a
 * ação de finalizar, que grava a resposta no pedido pra compra sair pelo
 * servidor só de quem aceitou). Sem diretiva: os dois lados importam.
 *
 * O cookie diz a resposta, a VERSÃO da pergunta e A QUEM ela disse sim:
 * "sim.2.gm" = sim, na versão 2, pro Google e pra Meta.
 *
 * - A VERSÃO sobe quando muda a finalidade ou a política (a última seção dela
 *   promete avisar antes de valer): a resposta de antes deixa de valer, e a
 *   faixa pergunta de novo. A 1 era só o Google Analytics, gravada como
 *   "sim"/"nao"; a 2 (25/09) entra com os anúncios.
 * - OS PARCEIROS: o "sim" vale pros parceiros que estavam na faixa quando a
 *   pessoa clicou. Entrou um parceiro novo no painel, a faixa pergunta de
 *   novo — ela não aceitou o TikTok se o TikTok não estava lá. O "não" vale
 *   pra qualquer lista: nada carrega, que é o lado seguro.
 */

export const COOKIE_CONSENTIMENTO = "fb_consentimento"
export const VERSAO_DO_CONSENTIMENTO = 2

export type Parceiro = "google" | "meta" | "tiktok" | "clarity"
export type Resposta = "sim" | "nao"
export type Consentimento = { resposta: Resposta; parceiros: Parceiro[] }

const LETRA: Record<Parceiro, string> = { google: "g", meta: "m", tiktok: "t", clarity: "c" }
const ORDEM: Parceiro[] = ["google", "meta", "tiktok", "clarity"]

/** O nome de quem recebe, na faixa. */
export const NOME_DO_PARCEIRO: Record<Parceiro, string> = {
  google: "Google",
  meta: "Meta",
  tiktok: "TikTok",
  clarity: "Microsoft",
}

/** Os parceiros que as integrações do painel ligam. */
export function parceirosDe(i: Integracoes): Parceiro[] {
  return ORDEM.filter((p) =>
    p === "google"
      ? Boolean(i.ga4 || i.googleAds)
      : p === "meta"
        ? Boolean(i.metaPixel)
        : p === "tiktok"
          ? Boolean(i.tiktok)
          : Boolean(i.clarity)
  )
}

/** "sim.2.gm" → { sim, [google, meta] }. Outra versão, ou lixo, é nulo: perguntar. */
export function lerConsentimento(valor: string | null | undefined): Consentimento | null {
  const m = /^(sim|nao)\.(\d+)\.([gmtc]*)$/.exec(valor ?? "")
  if (!m || Number(m[2]) !== VERSAO_DO_CONSENTIMENTO) return null
  return {
    resposta: m[1] as Resposta,
    parceiros: ORDEM.filter((p) => m[3].includes(LETRA[p])),
  }
}

export function valorDoConsentimento(resposta: Resposta, parceiros: Parceiro[]): string {
  const letras = ORDEM.filter((p) => parceiros.includes(p))
    .map((p) => LETRA[p])
    .join("")
  return `${resposta}.${VERSAO_DO_CONSENTIMENTO}.${letras}`
}

/** A resposta que vale pra estes parceiros: nulo = a faixa pergunta. */
export function respostaQueVale(c: Consentimento | null, parceiros: Parceiro[]): Resposta | null {
  if (!c) return null
  if (c.resposta === "nao") return "nao"
  return parceiros.every((p) => c.parceiros.includes(p)) ? "sim" : null
}
