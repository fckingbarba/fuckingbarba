import "server-only"
import { lerSessao, medusa } from "./conta"
import type { FichaDoSite } from "./ficha"
import { fichaValida } from "./ficha-valida"
import { sessaoParece } from "./sessao"

/**
 * A FICHA DE QUEM ESTÁ NA CONTA (entregas 0188 e 0190, `lib/ficha.ts`) —
 * pergunta ao Medusa com o token da sessão. `sem-sessao` quando não há sessão
 * ou o Medusa recusou o token; qualquer outro tropeço é "ficha nenhuma": ela
 * é um extra, e a página segue sem ela.
 */
export type LeituraDaFicha = { estado: "ok"; ficha: FichaDoSite | null } | { estado: "sem-sessao" }

export async function lerFichaDaConta(): Promise<LeituraDaFicha> {
  const token = await lerSessao()
  if (!token || !sessaoParece(token)) return { estado: "sem-sessao" }
  const r = await medusa("/store/crm/ficha", { metodo: "GET", token })
  if (r.status === 401) return { estado: "sem-sessao" }
  return { estado: "ok", ficha: r.status === 200 ? fichaValida(r.corpo.ficha) : null }
}
