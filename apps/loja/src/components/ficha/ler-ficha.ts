import type { FichaDoSite } from "@/lib/ficha"
import { fichaValida } from "@/lib/ficha-valida"

/**
 * QUEM PERGUNTA A FICHA (`/api/ficha`) — só baixa pra quem tem o `fb_conta`
 * (`./usar-ficha.ts`). Uma pergunta por aba: a resposta fica na memória da
 * página e no `sessionStorage` por meia hora, presa ao sorteio do `fb_conta`
 * (outra conta no mesmo navegador não vê a de antes). Quem chama junto — a
 * home e o aviso, ou o modo dev do React, que monta tudo duas vezes — espera
 * a mesma pergunta.
 */

const DA_ABA = "fb_ficha"
const MEIA_HORA = 30 * 60 * 1000

let naMemoria: { conta: string; em: number; ficha: Promise<FichaDoSite | null> } | null = null

function daAba(conta: string): { em: number; ficha: FichaDoSite | null } | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(DA_ABA) ?? "null") as {
      conta?: unknown
      em?: unknown
      ficha?: unknown
    } | null
    if (!g || g.conta !== conta || typeof g.em !== "number" || Date.now() - g.em > MEIA_HORA)
      return null
    return { em: g.em, ficha: fichaValida(g.ficha) }
  } catch {
    return null
  }
}

async function perguntar(conta: string): Promise<FichaDoSite | null> {
  try {
    const r = await fetch("/api/ficha", { cache: "no-store" })
    const ficha = fichaValida(((await r.json()) as { ficha?: unknown }).ficha)
    try {
      sessionStorage.setItem(DA_ABA, JSON.stringify({ conta, em: Date.now(), ficha }))
    } catch {}
    return ficha
  } catch {
    // A rede caiu: a próxima página tenta de novo.
    naMemoria = null
    return null
  }
}

/** A ficha desta aba: da memória, do `sessionStorage` ou de uma pergunta nova. */
export function lerFicha(conta: string): Promise<FichaDoSite | null> {
  if (naMemoria?.conta === conta && Date.now() - naMemoria.em < MEIA_HORA) return naMemoria.ficha
  const guardada = daAba(conta)
  naMemoria = guardada
    ? { conta, em: guardada.em, ficha: Promise.resolve(guardada.ficha) }
    : { conta, em: Date.now(), ficha: perguntar(conta) }
  return naMemoria.ficha
}

/** Depois do "Refazer o pedido" (e talvez de uma compra), a próxima página pergunta de novo. */
export function esquecerFicha() {
  naMemoria = null
  try {
    sessionStorage.removeItem(DA_ABA)
  } catch {}
}
