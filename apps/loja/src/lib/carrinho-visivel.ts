/**
 * O QUE A SACOLA MOSTRA — e só isso.
 *
 * Arquivo separado de `carrinho.ts` por uma razão muito concreta: aquele é
 * `server-only` e puxa o cliente do Medusa junto, e o cliente do Medusa tem
 * funções `"use cache"`, que o Next se recusa a empacotar pro navegador. A
 * gaveta precisa do FORMATO e do vazio inicial; se ela importasse os dois de
 * lá, arrastaria a loja inteira pro bundle e o build morria com "not allowed
 * to define inline use cache annotated functions in Client Components".
 *
 * Então aqui mora o contrato, sem nenhuma dependência: tipos e uma
 * constante. O servidor preenche (`paraVisivel`), o cliente desenha.
 *
 * O carrinho do Medusa tem umas oitenta chaves — provider de pagamento,
 * breakdown de imposto, contexto de promoção. Nada disso desenha uma linha na
 * sacola, e tudo isso atravessaria a rede a cada clique em "+". O dia em que
 * o Medusa renomear um campo interno, muda o mapeador e nenhum componente
 * sente.
 */

export type ItemDoCarrinho = {
  /** id da LINHA, não da variante — é ele que muda quantidade e remove */
  id: string
  varianteId: string
  nome: string
  variante: string | null
  handle: string | null
  imagem: string | null
  quantidade: number
  precoUnitario: number
  total: number
}

export type CarrinhoVisivel = {
  id: string
  itens: ItemDoCarrinho[]
  /** soma das quantidades — é o número do cabeçalho, não o de linhas */
  unidades: number
  subtotal: number
  total: number
}

export const CARRINHO_VAZIO: CarrinhoVisivel = {
  id: "",
  itens: [],
  unidades: 0,
  subtotal: 0,
  total: 0,
}
