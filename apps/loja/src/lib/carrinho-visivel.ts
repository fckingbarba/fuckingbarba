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
  /**
   * O que os produtos custam DEPOIS do desconto — o `item_total` do Medusa,
   * que é a soma das linhas que a gaveta mostra. É ele que aparece como
   * "Subtotal" no pé quando existe frete: com ele, subtotal + frete dá o
   * total que está logo embaixo. Com o `subtotal` de cima (antes do
   * desconto), um cupom faria a conta da tela não fechar.
   */
  totalDosItens: number
  /**
   * O frete que o carrinho JÁ TEM, em reais — `null` quando nenhuma entrega
   * foi escolhida, que é diferente de zero (zero é frete grátis).
   */
  frete: number | null
  /** id da opção de frete pendurada no carrinho, se houver. */
  freteEscolhido: string | null
  /** O CEP de entrega gravado no carrinho, só dígitos. Vazio se não há. */
  cep: string
  total: number
}

export const CARRINHO_VAZIO: CarrinhoVisivel = {
  id: "",
  itens: [],
  unidades: 0,
  subtotal: 0,
  totalDosItens: 0,
  frete: null,
  freteEscolhido: null,
  cep: "",
  total: 0,
}

/* ── o "leva junto" da sacola ─────────────────────────────────────────────── */

/**
 * Um produto que a gaveta oferece num clique: UMA variação, com preço e com
 * estoque — a lista sai do servidor pronta (`vitrineDaSacola`, em
 * `lib/medusa.ts`), e a gaveta só escolhe.
 */
export type SugestaoDaSacola = {
  varianteId: string
  handle: string
  nome: string
  imagem: string | null
  /** O preço de uma unidade, em reais, já com a promoção. */
  preco: number
}

export type SugestaoEscolhida = SugestaoDaSacola & {
  /** Sozinho, ele fecha o que falta pro frete grátis — a etiqueta do card. */
  libera: boolean
}

/**
 * O "LEVA JUNTO": até três produtos que ainda não estão na sacola, com a
 * regra do protótipo da loja.
 *
 * Faltando valor pro frete grátis, o MAIS BARATO que sozinho fecha a conta
 * vem primeiro, com a etiqueta "Libera o frete grátis" — é a sugestão que
 * resolve um problema da pessoa, e não só o da loja. Depois, os outros que
 * também fecham (do mais barato pro mais caro) e, por último, os que não
 * fecham (do mais caro pro mais barato: os que chegam mais perto). Sem nada
 * faltando — já é grátis, ou a loja não tem promoção —, a ordem da vitrine.
 *
 * Etiqueta só no primeiro, como no protótipo: ela aponta a melhor escolha,
 * e três etiquetas iguais lado a lado não apontam nada. Nenhuma frase diz
 * que os outros não fecham a conta.
 */
export function escolherLevaJunto(
  vitrine: readonly SugestaoDaSacola[],
  naSacola: ReadonlySet<string>,
  falta: number | null,
  quantos = 3
): SugestaoEscolhida[] {
  const fora = vitrine.filter((s) => !naSacola.has(s.varianteId))
  if (falta === null || falta <= 0) {
    return fora.slice(0, quantos).map((s) => ({ ...s, libera: false }))
  }
  const fecham = fora.filter((s) => s.preco >= falta).sort((a, b) => a.preco - b.preco)
  const resto = fora.filter((s) => s.preco < falta).sort((a, b) => b.preco - a.preco)
  return [...fecham, ...resto]
    .slice(0, quantos)
    .map((s, i) => ({ ...s, libera: i === 0 && s.preco >= falta }))
}
