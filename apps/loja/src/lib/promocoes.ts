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

/**
 * O PREÇO DE UMA UNIDADE que o carrinho cobra levando `unidades`, dos preços
 * que o backend responde por quantidade — `unitarios` é o de 1, 2 e 3
 * (`[49.9, 47.45, 49.9]`, da `escadaDeQuantidade`), e o último vale daí pra
 * cima. Sem os preços, `avulso`.
 *
 * Com o "Leve X, pague Y" valendo, o produto fica só nas faixas que acabam
 * antes do X (`faixasComPromocao`, no backend): num "leve 3", 2 unidades
 * pagam o preço da faixa de 2, e 3 ou mais voltam ao preço de uma. Por isso a
 * conta da promoção multiplica ESTE preço, e não o de uma unidade.
 */
export function unitarioEm(
  unitarios: readonly number[] | undefined,
  unidades: number,
  avulso: number
): number {
  return unitarios?.length
    ? unitarios[Math.min(Math.max(1, unidades), unitarios.length) - 1]!
    : avulso
}

/** O recado de uma linha da sacola. */
export type PromocaoDaLinha = {
  etiqueta: string
  /** A conta da promoção — pra gaveta prever o total da linha no "+" (`totalPrevisto`). */
  comprando: number
  pague: number
  /**
   * O preço de uma unidade por quantidade (`unitarioEm`), quando o servidor
   * mandou (`paraAGaveta`): no "+" de 1 pra 2, a linha prevê a faixa de 2; de
   * 2 pra 3, o preço de uma — a faixa sai onde a promoção vale.
   */
  unitarios?: number[]
  /** Quantas desta linha o Medusa deu de graça (pelo ajuste dele). */
  gratis: number
  /**
   * Quantas a mais fazem sair de graça — só na última linha da promoção, e só
   * quando as próximas unidades já são as de graça ("leve mais 1").
   */
  mais: number | null
  /** A promoção inteira está nesta linha (um produto só): dá pra dizer quanto as `mais` custam. */
  sozinha: boolean
  /**
   * Quanto as `mais` custam (`precoDoEmpurrao`, feito no servidor, em
   * `paraVisivel`): "mais 1 por R$ 4,90" na sacola. `null` = de graça, ou não
   * dá pra saber — e a sacola diz "sai de graça".
   */
  custam?: number | null
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
      sozinha: unidades.get(p.codigo) === linhas[i]!.quantidade,
    }
  })
}

/**
 * O total que a gaveta mostra numa linha enquanto o Medusa não responde (o
 * "+" e o "−" da sacola, e o "Adicionar" em cima de uma linha que já existe):
 * o unitário vezes as unidades — e, na linha de promoção, sem as de graça, e
 * com o preço da unidade NA quantidade nova (`unitarioEm`). Sem isso, 3 no
 * "leve 3, pague 2" mostrava o preço de 3 até a resposta, e pulava pro de 2;
 * e, desde que a faixa de 2 ficou (entrega 0142), o "+" de 2 pra 3 levaria o
 * desconto dela junto. É a conta de um produto só; com vários na mesma
 * promoção, quem acerta é a resposta.
 *
 * Fora de promoção, com os preços por quantidade da linha (`unitarios`,
 * entrega 0252), o "+" de 1 pra 2 já sai com o desconto da faixa de 2 — antes
 * mostrava duas vezes o preço de uma até a resposta.
 */
export function totalPrevisto(
  linha: {
    precoUnitario: number
    promocao?: Pick<PromocaoDaLinha, "comprando" | "pague" | "unitarios">
    unitarios?: readonly number[]
  },
  quantidade: number
): number {
  if (!linha.promocao)
    return (
      Math.round(unitarioEm(linha.unitarios, quantidade, linha.precoUnitario) * quantidade * 100) /
      100
    )
  const { comprando, pague, unitarios } = linha.promocao
  const unitario = unitarioEm(unitarios, quantidade, linha.precoUnitario)
  const gratis = gratisEm(quantidade, comprando, pague)
  return Math.round(unitario * (quantidade - gratis) * 100) / 100
}

/**
 * QUANTO CUSTAM AS DO EMPURRÃO ("mais 1"), quando dá pra saber: com a
 * promoção inteira na linha (`sozinha`) e os preços por quantidade dela. Num
 * "leve 3" com a faixa de 2 valendo, a terceira não sai de graça de 2 pra 3:
 * sai a diferença, porque a faixa de 2 deixa de valer (entrega 0142) — a
 * sacola diz "mais 1 por R$ 4,90", e não "sai de graça", que o total
 * desmentiria no clique. `0` é de graça mesmo; `null`, não dá pra saber (e
 * a sacola fica no "sai de graça", a conta da promoção). Roda no servidor
 * (`paraVisivel`): a gaveta mora em toda página, e a home não tem folga de
 * JavaScript (o quadro do LCP, no AGENTS.md).
 */
export function precoDoEmpurrao(linha: {
  quantidade: number
  precoUnitario: number
  promocao?: PromocaoDaLinha
}): number | null {
  const p = linha.promocao
  if (!p?.mais || !p.sozinha || !p.unitarios) return null
  const diferenca =
    totalPrevisto(linha, linha.quantidade + p.mais) - totalPrevisto(linha, linha.quantidade)
  return Math.max(0, Math.round(diferenca * 100) / 100)
}
