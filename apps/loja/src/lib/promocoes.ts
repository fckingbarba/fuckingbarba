/**
 * AS PROMOÇÕES DO PAINEL, NA LOJA — o "Leve X, pague Y" (entrega 0133).
 *
 * Quem DÁ o desconto é o Medusa, no carrinho: uma promoção automática que o
 * painel cria (`apps/backend/src/lib/promocoes.ts`), sem código digitado. A
 * loja só MOSTRA, a partir da lista que o backend manda
 * (`GET /store/promocoes`, lida em `lib/medusa.ts` → `promocoesDaLoja`): o
 * selo no card e na página do produto, o cartão de quantidade com as
 * unidades de graça, e o recado de cada linha da sacola.
 *
 * Sem dependência nenhuma: a gaveta (componente de cliente) usa os tipos.
 *
 * A CONTA DAS DE GRAÇA É A DO MEDUSA: a cada `comprando` unidades dos
 * produtos da promoção, `comprando − pague` saem de graça — um grupo por vez
 * (`gratisEm`). Com um produto só, é exata; com vários, quem diz QUAL linha
 * saiu de graça é o ajuste do Medusa na linha (`paraVisivel`, em
 * `lib/carrinho.ts`), nunca esta conta.
 */

/** O começo do código das promoções automáticas — não é cupom (ninguém digita). */
export const PREFIXO_DA_PROMOCAO = "PROMO-"

export const ehCodigoDePromocao = (codigo: string) =>
  codigo.toUpperCase().startsWith(PREFIXO_DA_PROMOCAO)

/** Uma promoção que vale agora, como o backend manda. */
export type PromocaoNaLoja = {
  codigo: string
  /** O selo: "Leve 3, pague 2". */
  etiqueta: string
  comprando: number
  pague: number
  /** Os produtos (ids) em que ela vale agora. */
  produtos: string[]
  /** Até quando, em ms; `null` = sem fim. */
  ate: number | null
}

/** O que a página do produto precisa de uma promoção: o selo e a conta. */
export type PromocaoDoProduto = Pick<PromocaoNaLoja, "etiqueta" | "comprando" | "pague">

/** O teto do backend (`MAX_GRATIS`): o Medusa não dá mais que isso num carrinho. */
const MAX_GRATIS = 99

/** A promoção de um produto, ou `null` — a primeira da lista que o inclui. */
export function promocaoDoProduto(
  promocoes: readonly PromocaoNaLoja[],
  produtoId: string | null | undefined
): PromocaoDoProduto | null {
  if (!produtoId) return null
  const p = promocoes.find((x) => x.produtos.includes(produtoId))
  return p ? { etiqueta: p.etiqueta, comprando: p.comprando, pague: p.pague } : null
}

/**
 * Quantas saem de graça levando `unidades`: a cada `comprando`,
 * `comprando − pague`. 5 num "leve 3, pague 2": 1. 6: 2.
 */
export function gratisEm(unidades: number, comprando: number, pague: number): number {
  if (!(unidades > 0) || !(comprando > pague) || !(pague >= 1)) return 0
  return Math.min(Math.floor(unidades / comprando) * (comprando - pague), MAX_GRATIS)
}

/** O recado de uma linha da sacola. */
export type PromocaoDaLinha = {
  etiqueta: string
  /** A conta da promoção — pra gaveta prever o total da linha no "+" (`totalPrevisto`). */
  comprando: number
  pague: number
  /** Quantas desta linha o Medusa deu de graça (pelo ajuste dele). */
  gratis: number
  /**
   * Quantas a mais fazem sair de graça — só na última linha da promoção, e só
   * quando as próximas unidades já são as de graça ("leve mais 1").
   */
  mais: number | null
}

/**
 * O recado de cada linha: a etiqueta da promoção do produto, quantas saíram
 * de graça nela, e — na última linha de cada promoção — quantas a mais fazem
 * a próxima sair de graça. As unidades se somam entre as linhas da mesma
 * promoção (o Medusa junta produtos diferentes num grupo).
 */
export function promocoesDasLinhas(
  linhas: readonly { produto: string | null; quantidade: number; gratis: number }[],
  promocoes: readonly PromocaoNaLoja[]
): (PromocaoDaLinha | null)[] {
  const daLinha = linhas.map((l) =>
    l.produto ? (promocoes.find((p) => p.produtos.includes(l.produto!)) ?? null) : null
  )
  const ultima = new Map<string, number>()
  const unidades = new Map<string, number>()
  daLinha.forEach((p, i) => {
    if (!p) return
    ultima.set(p.codigo, i)
    unidades.set(p.codigo, (unidades.get(p.codigo) ?? 0) + linhas[i]!.quantidade)
  })
  return daLinha.map((p, i) => {
    if (!p) return null
    let mais: number | null = null
    if (ultima.get(p.codigo) === i) {
      const resto = (unidades.get(p.codigo) ?? 0) % p.comprando
      if (resto >= p.pague) mais = p.comprando - resto
    }
    return {
      etiqueta: p.etiqueta,
      comprando: p.comprando,
      pague: p.pague,
      gratis: linhas[i]!.gratis,
      mais,
    }
  })
}

/**
 * O total que a gaveta mostra numa linha enquanto o Medusa não responde (o
 * "+" e o "−" da sacola, e o "Adicionar" em cima de uma linha que já existe):
 * o unitário vezes as unidades — e, na linha de promoção, sem as de graça.
 * Sem isso, 3 no "leve 3, pague 2" mostrava o preço de 3 até a resposta, e
 * pulava pro de 2. É a conta de um produto só; com vários na mesma promoção,
 * quem acerta é a resposta.
 */
export function totalPrevisto(
  linha: { precoUnitario: number; promocao?: Pick<PromocaoDaLinha, "comprando" | "pague"> },
  quantidade: number
): number {
  const gratis = linha.promocao
    ? gratisEm(quantidade, linha.promocao.comprando, linha.promocao.pague)
    : 0
  return Math.round(linha.precoUnitario * (quantidade - gratis) * 100) / 100
}
