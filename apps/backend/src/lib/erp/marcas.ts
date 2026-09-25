/**
 * AS MARCAS QUE A IMPORTAÇÃO DO ERP LÊ NO `metadata` DO PRODUTO — num módulo
 * sem dependência, pra quem só precisa ler (o painel, com testes) não trazer
 * junto os workflows do `catalogo.ts`, que as usa e reexporta.
 */

/** O produto veio do ERP: `{ erp, id, fotos, nome }` (ver `catalogo.ts`). */
export const MARCA_DO_ERP = "fb_erp"

/**
 * As fotos que a equipe escolheu pra loja (as da Nuvemshop, `lib/nuvemshop.ts`,
 * e as do painel). Produto com esta marca nunca tem as fotos trocadas pelas
 * do ERP — nem na primeira importação.
 */
export const MARCA_DAS_FOTOS = "fb_fotos"

/**
 * O nome que a equipe deu no painel (Produtos → Textos): `{ em, por }`.
 * Produto com esta marca nunca tem o nome trocado pelo do ERP — nem na
 * primeira importação, nem quando é recriado: o Bling segue com o dele (a
 * nota, os marketplaces), e a loja com o seu, curto pra caber na página
 * (entrega 0099).
 */
export const MARCA_DO_NOME = "fb_nome"

/**
 * O preço mudado no painel (a lista de Produtos, `lib/painel/gravar-preco.ts`):
 * `{ origem, em }`. Da segunda importação em diante, produto com esta marca
 * fica com o preço de hoje — o do ERP não entra. Na primeira ("do zero"), a
 * marca sai junto com as outras chaves (entrega 0102).
 */
export const MARCA_DO_PRECO = "fb_preco"

const objeto = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** O produto tem o nome dado no painel (a marca `fb_nome`)? */
export function temNomeDaLoja(metadata: unknown): boolean {
  return Boolean(objeto(metadata)?.[MARCA_DO_NOME])
}

/** O nome do produto no ERP, que a última importação guardou na marca `fb_erp`. */
export function nomeNoErp(metadata: unknown): string | null {
  const nome = objeto(objeto(metadata)?.[MARCA_DO_ERP])?.nome
  return typeof nome === "string" && nome.trim() ? nome.trim() : null
}
