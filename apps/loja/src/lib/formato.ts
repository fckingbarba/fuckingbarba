/**
 * Formatação em pt-BR. Um lugar só, porque preço formatado de três jeitos
 * diferentes na mesma página é erro que ninguém vê até o cliente ver.
 */

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Centavos → "R$ 149,90". O Medusa guarda dinheiro em centavos (inteiro) e é
 * assim que ele deve andar pela aplicação: `0.1 + 0.2` em ponto flutuante não
 * dá `0.3`, e num carrinho isso vira um centavo de diferença entre o que a
 * pessoa vê e o que ela paga.
 *
 * O espaço depois do "R$" é um espaço fixo (U+00A0) — quem põe é o Intl, e é
 * o que impede o valor de quebrar em duas linhas no meio.
 */
export function emReais(centavos: number): string {
  return REAIS.format(centavos / 100)
}
