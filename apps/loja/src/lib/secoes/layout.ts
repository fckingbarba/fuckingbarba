import { home } from "@/lib/medusa"
import { pdpDoProduto } from "@/lib/pdp"
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
 * A FONTE, hoje: no produto, o `metadata` dele no Medusa (`fb_pdp`), que o
 * painel edita na página de cada produto; na home, a versão PUBLICADA do
 * "Layout da home" do painel (`home()`, que vem do `metadata` da loja).
 *
 * ┌─ SEM CACHE PRÓPRIO, DE PROPÓSITO (24/09) ──────────────────────────────┐
 * │ O ajuste era um `"use cache"` com etiqueta própria (`layout:home`,      │
 * │ `layout:produto:<handle>`) que lia OUTRO `"use cache"` — o `home()`,    │
 * │ o produto. No "Publicar" as duas etiquetas caíam juntas; o de fora     │
 * │ se refazia lendo o de dentro AINDA VENCIDO, e guardava a ordem velha   │
 * │ como nova, por dias: o texto mudava no site, e a ordem não. Visto na   │
 * │ home, com a barra de vantagens desligada que não voltava.              │
 * │                                                                         │
 * │ Agora o ajuste lê direto da fonte, que já é cacheada (a etiqueta       │
 * │ `home`; a `produto:<handle>`): um cache só, que o "Salvar" e o         │
 * │ "Publicar" derrubam. O backend ainda manda as etiquetas `layout:*` —    │
 * │ derrubar etiqueta que ninguém usa não faz nada.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
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

/**
 * A fonte da configuração: dado puro, lido do que a loja já guarda em cache
 * (ver o quadro lá em cima — o ajuste não tem cache próprio).
 */
export async function lerAjuste(escopo: Escopo, handle?: string): Promise<AjusteDeLayout | null> {
  const layout: AjusteDeLayout =
    escopo === "home" ? (await home()).layout : handle ? (await pdpDoProduto(handle)).layout : {}

  /*
    Ajuste vazio devolve `null`, e não `{}`. São a mesma coisa pro
    `resolver`, mas `null` diz "esta página não pediu exceção nenhuma" —
    que é o caso da esmagadora maioria e é o que o ajuste esparso existe pra
    representar.
  */
  return layout.visibilidade || layout.ordem ? layout : null
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
 *
 * A seção `fixo` volta pro lugar dela no registro (o topo da página do
 * produto), mesmo que a ordem salva a cite em outro — ou não a cite: uma
 * ordem que esquecesse o topo o mandaria pro fim da página.
 */
function aplicarOrdem(secoes: Secao[], ordem: readonly string[]): Secao[] {
  const porId = new Map(secoes.filter((s) => !s.fixo).map((s) => [s.id, s]))
  const postas: Secao[] = []

  for (const id of ordem) {
    const s = porId.get(id)
    if (!s) continue
    porId.delete(id)
    postas.push(s)
  }

  const resultado = [...postas, ...porId.values()]
  secoes.forEach((s, i) => {
    if (s.fixo) resultado.splice(i, 0, s)
  })
  return resultado
}
