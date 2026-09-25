/**
 * O RASTRO DA COMPRA — o que a loja manda logo depois de fechar o pedido
 * (`POST /store/pedidos/rastro`, só ela, assinada) e fica no pedido em
 * `metadata.fb_rastro`: a resposta sobre os cookies e, só com o sim, os
 * cookies dos parceiros, o IP e o navegador. É o que a compra pelo servidor
 * (`enviar.ts`) usa pra casar o pedido com o anúncio.
 *
 * Código puro, com testes. O que chega é conferido campo a campo — tamanho e
 * caracteres —, porque vai pra dentro da chamada de outra empresa.
 *
 * SEM O SIM, SÓ A RESPOSTA: o servidor precisa saber que NÃO pode avisar
 * ninguém. E o sim vale só pros parceiros que estavam na faixa quando a
 * pessoa clicou (`parceiros`).
 */

export const CHAVE_DO_RASTRO = "fb_rastro"

export type Parceiro = "google" | "meta" | "tiktok" | "clarity"
const PARCEIROS: Parceiro[] = ["google", "meta", "tiktok", "clarity"]

export type Rastro = {
  /** Quando a loja gravou (ISO). */
  em: string
  consentimento: "sim" | "nao" | null
  parceiros: Parceiro[]
  /** Os cookies do GA4, crus: `_ga` e `_ga_<código>` (`idsDoGa` tira o que serve). */
  ga: { cookie: string | null; sessao: string | null } | null
  meta: { fbp: string | null; fbc: string | null } | null
  tiktok: { ttp: string | null } | null
  ip: string | null
  navegador: string | null
  /** A página da compra (o checkout), pra Meta e o TikTok. */
  pagina: string | null
}

const texto = (v: unknown, formato: RegExp, max: number): string | null =>
  typeof v === "string" && v.length <= max && formato.test(v) ? v : null

const objeto = (v: unknown) =>
  (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>

/** O que pode ir de cookie: sem espaço, aspas ou controle. */
const DE_COOKIE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:.]{2,45})$/

/** A leitura defensiva: o que não passa vira nulo, e sem data não há rastro. */
export function lerRastro(bruto: unknown): Rastro | null {
  if (!bruto || typeof bruto !== "object") return null
  const o = bruto as Record<string, unknown>
  const em = typeof o.em === "string" && !Number.isNaN(Date.parse(o.em)) ? o.em : null
  if (!em) return null
  const consentimento =
    o.consentimento === "sim" || o.consentimento === "nao" ? o.consentimento : null
  const sim = consentimento === "sim"
  const ga = objeto(o.ga)
  const meta = objeto(o.meta)
  const tiktok = objeto(o.tiktok)
  return {
    em,
    consentimento,
    parceiros:
      sim && Array.isArray(o.parceiros)
        ? PARCEIROS.filter((p) => (o.parceiros as unknown[]).includes(p))
        : [],
    ga:
      sim && o.ga
        ? {
            cookie: texto(ga.cookie, DE_COOKIE, 200),
            sessao: texto(ga.sessao, DE_COOKIE, 300),
          }
        : null,
    meta:
      sim && o.meta
        ? {
            fbp: texto(meta.fbp, /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/, 300),
            fbc: texto(meta.fbc, /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/, 600),
          }
        : null,
    tiktok: sim && o.tiktok ? { ttp: texto(tiktok.ttp, DE_COOKIE, 200) } : null,
    ip: sim ? texto(o.ip, IP, 45) : null,
    navegador: sim && typeof o.navegador === "string" ? o.navegador.slice(0, 500) || null : null,
    pagina: sim ? texto(o.pagina, /^https?:\/\/[^\s"'<>]+$/, 500) : null,
  }
}

/**
 * Os ids do GA4 nos cookies dele — o formato não é documentado pelo Google,
 * então vale o que se viu (25/09):
 * - `_ga` = "GA1.1.1811307102.1790348181": o `client_id` são as duas últimas partes;
 * - `_ga_<código>` = "GS2.1.s1790348180$o1$g0$t…" (o novo; o `$` pode vir
 *   como %24) ou "GS1.1.1790348180.1.0…" (o de antes): o `session_id`.
 */
export function idsDoGa(ga: Rastro["ga"]): { clientId: string | null; sessionId: string | null } {
  const cookie = ga?.cookie ?? ""
  const m = /^GA\d\.\d+\.(\d+\.\d+)$/.exec(cookie)
  let sessao = ga?.sessao ?? ""
  try {
    sessao = decodeURIComponent(sessao)
  } catch {
    // fica como veio: o "$" cru também serve
  }
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(sessao)
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(sessao)
  return { clientId: m?.[1] ?? null, sessionId: gs2?.[1] ?? gs1?.[1] ?? null }
}
