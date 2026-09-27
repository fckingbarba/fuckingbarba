/**
 * AS LISTAS EM PÁGINAS — o recorte que o backend manda junto de cada lista
 * (`apps/backend/src/lib/painel/paginas.ts`): a página mostrada, quantas
 * existem e quantos itens a lista inteira tem, com o filtro e a busca.
 */
export type Paginacao = {
  pagina: number
  paginas: number
  porPagina: number
  itens: number
}

/** O `?pagina=` do endereço, como o backend lê: inteiro de 1 em diante; o resto não vai. */
export function paginaDoEndereco(v: string | string[] | undefined): number | null {
  const s = typeof v === "string" ? v.trim() : ""
  return /^\d{1,6}$/.test(s) && Number(s) >= 1 ? Number(s) : null
}
