import { cacheLife, cacheTag } from "next/cache"
import { SECOES, type Escopo, type Secao } from "./registro"

/**
 * QUAIS SEÇÕES A PÁGINA MONTA, E EM QUE ORDEM
 *
 * Duas peças, separadas de propósito:
 *
 *   lerAjuste()  vai buscar o que foi configurado. Devolve DADO PURO —
 *                ids, booleanos e uma lista de strings. É a única função que
 *                muda quando a fonte sair daqui e for pro banco.
 *
 *   resolver()   junta esse dado com o registro e devolve os componentes na
 *                ordem certa. Roda fora do cache, porque componente React
 *                não é serializável e não pode atravessar `"use cache"`.
 *
 * O AJUSTE É ESPARSO. Ele guarda só o que DIFERE do padrão. Se cada produto
 * guardasse a lista inteira, o dia em que você mudasse a ordem padrão ela não
 * chegaria em nenhum produto já cadastrado — todos estariam congelados na
 * ordem do dia em que foram salvos. Assim, produto novo nasce configurado e
 * mudança no padrão alcança todo mundo que não pediu exceção.
 *
 * HOJE não existe fonte: `lerAjuste` devolve `null` e toda página monta o
 * padrão do registro. O painel que vier escreve numa tabela do schema `loja`
 * do Supabase e esta função passa a lê-la — sem tocar em nenhuma página.
 * Quando isso acontecer, publicar deve derrubar a tag correspondente:
 *
 *   POST /api/revalidar  { "tags": ["layout:produto:oleo-para-barba"] }
 */

export type AjusteDeLayout = {
  /**
   * Liga/desliga por seção. O que não estiver aqui segue o padrão do
   * registro — é isso que faz o ajuste ser esparso.
   */
  visibilidade?: Record<string, boolean>
  /**
   * Ordem própria, quando esta página precisa de uma. Lista COMPLETA de ids,
   * não um remendo: ordenação esparsa ("mova só este pra cima") é onde esse
   * tipo de sistema começa a errar sozinho. Id desconhecido é ignorado, id
   * que faltar vai pro fim na ordem do registro.
   */
  ordem?: readonly string[]
}

export const TAGS_LAYOUT = {
  home: "layout:home",
  produto: (handle: string) => `layout:produto:${handle}`,
  produtoPadrao: "layout:produto",
} as const

/**
 * A fonte da configuração. Cacheada com tag própria pra que publicar no
 * painel derrube só a página afetada, e não o catálogo inteiro.
 */
export async function lerAjuste(escopo: Escopo, handle?: string): Promise<AjusteDeLayout | null> {
  "use cache"
  cacheTag(escopo === "home" ? TAGS_LAYOUT.home : TAGS_LAYOUT.produtoPadrao)
  if (handle) cacheTag(TAGS_LAYOUT.produto(handle))
  cacheLife("days")

  // Enquanto não existe painel, o padrão do registro é a configuração.
  return null
}

/**
 * Registro + ajuste = a lista que a página renderiza.
 *
 * Seção `fixo` ignora o ajuste inteiro: não desliga e não sai do lugar.
 */
export function resolver(escopo: Escopo, ajuste?: AjusteDeLayout | null): Secao[] {
  const doEscopo = SECOES.filter((s) => s.escopo === escopo)

  const ordenadas = ajuste?.ordem?.length ? aplicarOrdem(doEscopo, ajuste.ordem) : doEscopo

  return ordenadas.filter((s) => {
    if (s.fixo) return true
    const escolha = ajuste?.visibilidade?.[s.id]
    return escolha ?? !s.ocultaPorPadrao
  })
}

/**
 * Id que não existe mais no registro é descartado, e seção que o ajuste
 * esqueceu vai pro fim. Os dois casos acontecem de verdade: o primeiro
 * quando uma seção é removida do código com ajuste salvo apontando pra ela,
 * o segundo quando uma seção nova entra depois de alguém já ter salvo uma
 * ordem. Nos dois, a página tem que continuar de pé.
 */
function aplicarOrdem(secoes: Secao[], ordem: readonly string[]): Secao[] {
  const porId = new Map(secoes.map((s) => [s.id, s]))
  const postas: Secao[] = []

  for (const id of ordem) {
    const s = porId.get(id)
    if (!s) continue
    porId.delete(id)
    postas.push(s)
  }

  return [...postas, ...porId.values()]
}
