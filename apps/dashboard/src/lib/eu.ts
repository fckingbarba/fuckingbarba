import "server-only"
import { cookies } from "next/headers"
import { cache } from "react"
import type { Area, Membro } from "./equipe"
import { medusa } from "./medusa"
import { COOKIE_SESSAO } from "./sessao"

export type LeituraDoMembro =
  | { estado: "ok"; membro: Membro; areas: Area[]; avisos: Avisos }
  | { estado: "sem-sessao" }
  /**
   * O Medusa recusou. `fora`: a pessoa saiu da equipe (ou o convite venceu
   * antes de ela entrar). `expirou`: o token não vale mais — venceu, ou o
   * segredo do Railway mudou.
   */
  | { estado: "fora"; motivo: "fora" | "expirou" }
  /** O Medusa não respondeu. Não é motivo pra tirar ninguém do painel. */
  | { estado: "fora-do-ar" }

/**
 * QUEM ESTÁ USANDO O PAINEL — uma pergunta ao Medusa por página.
 *
 * `cache` do React: a casca e a página perguntam, e o Medusa ouve uma vez
 * só por carregamento. A resposta é do banco, na hora: papel trocado ou
 * pessoa removida valem no próximo clique.
 */
/** O número vermelho de uma área no menu (os problemas graves da Observabilidade). */
export type Avisos = Partial<Record<Area, number>>

export const lerMembro = cache(async (): Promise<LeituraDoMembro> => {
  if (!(await cookies()).get(COOKIE_SESSAO)?.value) return { estado: "sem-sessao" }
  const r = await medusa("/dashboard/eu", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    return { estado: "fora", motivo: r.corpo.message === "fora_da_equipe" ? "fora" : "expirou" }
  if (r.status !== 200) return { estado: "fora-do-ar" }
  const membro = r.corpo.membro as Membro | undefined
  const areas = r.corpo.areas as Area[] | undefined
  if (!membro || !Array.isArray(areas)) return { estado: "fora-do-ar" }
  const avisos = (r.corpo.avisos ?? {}) as Avisos
  return { estado: "ok", membro, areas, avisos }
})
