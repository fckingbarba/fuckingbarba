/**
 * Formatação em pt-BR. Um lugar só, porque preço formatado de três jeitos
 * diferentes na mesma página é erro que ninguém vê até o cliente ver.
 *
 * Unidade: **reais**, com centavos na parte decimal (54.9 são R$ 54,90). É a
 * unidade que o Medusa v2 usa e devolve, e converter pra centavos aqui só
 * criaria dois sistemas de medida na mesma aplicação — que é como nasce o
 * bug de multiplicar por cem duas vezes. Conta de dinheiro (soma de carrinho,
 * desconto, frete) quem faz é o Medusa; aqui a gente só escreve na tela.
 */

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * 54.9 → "R$ 54,90".
 *
 * O espaço depois do "R$" é fixo (U+00A0) — quem põe é o Intl, e é o que
 * impede o valor de quebrar em duas linhas no meio.
 */
export function emReais(valor: number): string {
  return REAIS.format(valor)
}

/**
 * O mesmo valor partido em duas, pro banner, que escreve os centavos menores
 * e sobrescritos: 99.9 → `{ inteiro: "R$ 99", centavos: ",90" }`.
 */
export function emReaisPartido(valor: number): { inteiro: string; centavos: string } {
  const texto = emReais(valor)
  const virgula = texto.lastIndexOf(",")
  if (virgula < 0) return { inteiro: texto, centavos: "" }
  return { inteiro: texto.slice(0, virgula), centavos: texto.slice(virgula) }
}
