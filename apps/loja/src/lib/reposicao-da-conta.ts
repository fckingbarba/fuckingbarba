import "server-only"
import { lerSessao, medusa } from "./conta"
import { avisoValido, type AvisoDaReposicao } from "./reposicao"
import { sessaoParece } from "./sessao"

/**
 * O AVISO DA REPOSIÇÃO DE QUEM ESTÁ NA CONTA (entrega 0188, `lib/reposicao.ts`)
 * — pergunta ao Medusa com o token da sessão. `sem-sessao` quando não há
 * sessão ou o Medusa recusou o token; qualquer outro tropeço é "nada pra
 * repor": o aviso é um extra, e a página segue sem ele.
 */
export type LeituraDaReposicao =
  { estado: "ok"; aviso: AvisoDaReposicao | null } | { estado: "sem-sessao" }

export async function lerReposicaoDaConta(): Promise<LeituraDaReposicao> {
  const token = await lerSessao()
  if (!token || !sessaoParece(token)) return { estado: "sem-sessao" }
  const r = await medusa("/store/crm/reposicao", { metodo: "GET", token })
  if (r.status === 401) return { estado: "sem-sessao" }
  return { estado: "ok", aviso: r.status === 200 ? avisoValido(r.corpo.reposicao) : null }
}
