/**
 * AS ORDENS DA VITRINE — o `?ordem=` da categoria e da `/produtos`.
 *
 * Moram num arquivo SEM dependência nenhuma porque o `proxy.ts` precisa
 * delas: é ele que troca `/barba?ordem=barato` pela página estática daquela
 * ordem (ver o proxy). O `lib/catalogo.ts` puxa o Medusa, e o proxy não pode
 * carregar isso a cada requisição do site.
 */

export const ORDENS = [
  { id: "", nome: "Relevância" },
  { id: "barato", nome: "Menor preço" },
  { id: "caro", nome: "Maior preço" },
  { id: "desconto", nome: "Maior desconto" },
  { id: "novidade", nome: "Novidades" },
] as const

export type Ordem = (typeof ORDENS)[number]["id"]

/**
 * `?ordem=` vem da URL, ou seja, de qualquer um. Valor que não está na lista
 * vira relevância em silêncio — a alternativa seria 404 numa página que
 * existe, por causa de um parâmetro que alguém digitou errado.
 */
export function lerOrdem(valor: string | string[] | undefined): Ordem {
  const texto = Array.isArray(valor) ? valor[0] : valor
  const achou = ORDENS.find((o) => o.id === texto)
  return achou ? achou.id : ""
}

/** As ordens que têm página própria: todas menos a padrão (relevância). */
export const ORDENS_COM_PAGINA = ORDENS.filter((o) => o.id).map((o) => o.id)
