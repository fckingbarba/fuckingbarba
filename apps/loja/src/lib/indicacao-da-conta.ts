import "server-only"
import { lerSessao, medusa } from "./conta"
import { indicacaoValida, type IndicacaoDaConta } from "./indicacao"
import { sessaoParece } from "./sessao"

/**
 * O INDIQUE DE QUEM ESTÁ NA CONTA (entrega 0215, `lib/indicacao.ts`) —
 * pergunta ao Medusa com o token da sessão. `sem-sessao` quando não há
 * sessão ou o Medusa recusou o token; qualquer outro tropeço é "nada": o
 * bloco é um extra, e a página segue sem ele.
 */
export type LeituraDaIndicacao =
  { estado: "ok"; indicacao: IndicacaoDaConta | null } | { estado: "sem-sessao" }

export async function lerIndicacaoDaConta(): Promise<LeituraDaIndicacao> {
  const token = await lerSessao()
  if (!token || !sessaoParece(token)) return { estado: "sem-sessao" }
  const r = await medusa("/store/crm/indicacao", { metodo: "GET", token })
  if (r.status === 401) return { estado: "sem-sessao" }
  return { estado: "ok", indicacao: r.status === 200 ? indicacaoValida(r.corpo.indicacao) : null }
}
