import type { Integracoes } from "@/lib/configuracoes"

/**
 * A RESPOSTA SOBRE OS COOKIES — o que a faixa e a política de privacidade
 * gravam e quem lê: o navegador (`components/analytics/`) e o checkout (a
 * ação de finalizar, que grava a resposta no pedido pra compra sair pelo
 * servidor pros parceiros). Sem diretiva: os dois lados importam.
 *
 * DESDE A 0230 SÓ O "NÃO" TRAVA: as tags de todos os parceiros ligam na
 * primeira página, como na Nuvemshop, e a compra vai pra todos de quem não
 * recusou. O "sim" é o "Entendi" da faixa (um botão só, o da Nuvemshop), e
 * libera o CRM da própria loja (`lib/anotar.ts`); o "não" vem da recusa na
 * política de privacidade.
 *
 * O cookie diz a resposta, a VERSÃO da pergunta e OS PARCEIROS da faixa
 * quando a pessoa respondeu: "sim.3.gm" = sim, na versão 3, com o Google e a
 * Meta.
 *
 * - A VERSÃO sobe quando muda a finalidade ou a política: a resposta de antes
 *   deixa de valer, e a faixa aparece de novo. A 1 era só o Google
 *   Analytics, gravada como "sim"/"nao"; a 2 (25/09) entra com os anúncios;
 *   a 3 (26/09) com o que a própria loja anota pro CRM.
 * - OS PARCEIROS: entrou um parceiro novo no painel, o "sim" de antes volta a
 *   ser "sem resposta" e a faixa aparece de novo. O "não" vale pra qualquer
 *   lista: nada carrega, que é o lado seguro.
 * - A versão NÃO subiu na 0166 (o GA4 passou a medir antes da resposta) nem
 *   na 0230 (todas as tags antes da resposta): quem já tinha dito sim tinha
 *   aceitado mais do que isso, e quem disse não segue fora — subir a versão
 *   faria o "não" de antes voltar a ser "sem resposta", e as tags ligariam
 *   pra quem já tinha recusado.
 * - Nem na 0236 (o atendimento pelo WhatsApp, com a Meta e a IA da
 *   Anthropic): não é cookie, e é a pessoa que escolhe escrever. A política
 *   de privacidade mudou antes de o atendente valer, e é ela que conta.
 */

export const COOKIE_CONSENTIMENTO = "fb_consentimento"
export const VERSAO_DO_CONSENTIMENTO = 3

export type Parceiro = "google" | "meta" | "tiktok" | "clarity"
export type Resposta = "sim" | "nao"
export type Consentimento = { resposta: Resposta; parceiros: Parceiro[] }

const LETRA: Record<Parceiro, string> = { google: "g", meta: "m", tiktok: "t", clarity: "c" }
const ORDEM: Parceiro[] = ["google", "meta", "tiktok", "clarity"]

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

/** "sim.3.gm" → { sim, [google, meta] }. Outra versão, ou lixo, é nulo: sem resposta. */
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

/** A resposta que vale pra estes parceiros: nulo = sem resposta (a faixa aparece). */
export function respostaQueVale(c: Consentimento | null, parceiros: Parceiro[]): Resposta | null {
  if (!c) return null
  if (c.resposta === "nao") return "nao"
  return parceiros.every((p) => c.parceiros.includes(p)) ? "sim" : null
}
