/**
 * AS LISTAS DO PAINEL EM PÁGINAS — pedidos, clientes, carrinhos, cupons e a
 * newsletter vêm de 30 em 30 (a newsletter, de 50), com o número da página
 * no endereço (`?pagina=2`).
 *
 * As contas (as fitas de filtro, os números de cima, a busca) seguem sobre a
 * lista inteira: a página é só o recorte que viaja até a tela. Assim a
 * resposta e a tela ficam do tamanho de uma página, e a lista mais comprida
 * não pesa no clique.
 *
 * Página que não existe (a 9 de uma lista de 3) vira a última: quem voltou
 * pra uma busca que encolheu vê o fim da lista, e não uma tela vazia.
 */

export const POR_PAGINA = 30

export type Paginacao = {
  /** A página mostrada, a partir de 1. */
  pagina: number
  /** Quantas páginas a lista tem (pelo menos 1, mesmo vazia). */
  paginas: number
  porPagina: number
  /** Quantos itens a lista inteira tem — com o filtro e a busca, antes do recorte. */
  itens: number
}

/** O `?pagina=` do endereço: inteiro de 1 em diante; o resto vira a primeira. */
export function lerPagina(v: unknown): number {
  const n = typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : NaN
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export function paginar<T>(
  lista: T[],
  pedida: number,
  porPagina: number = POR_PAGINA
): { itens: T[]; paginacao: Paginacao } {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina))
  const pagina = Math.min(Math.max(1, Math.trunc(pedida) || 1), paginas)
  return {
    itens: lista.slice((pagina - 1) * porPagina, pagina * porPagina),
    paginacao: { pagina, paginas, porPagina, itens: lista.length },
  }
}
