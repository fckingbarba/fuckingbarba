/**
 * A REGRA DE QUAIS ENTREGAS APARECEM.
 *
 * Arquivo próprio, e não uma função dentro de quem chama, porque quem chama
 * são dois: a sacola (`acoes/frete.ts`, que cota por faixa e pendura uma no
 * carrinho) e o checkout (`checkout.ts`, que lista as opções do Medusa). Se
 * cada um escrevesse a sua versão da regra, um dia a gaveta ofereceria uma
 * entrega que a tela seguinte não oferece — e a pessoa veria a escolha dela
 * sumir no meio da compra sem explicação nenhuma.
 *
 * Nada aqui fala com servidor nem calcula dinheiro: entra lista, sai lista.
 */

/**
 * A ECONÔMICA SOME QUANDO CUSTA O MESMO QUE A EXPRESSA.
 *
 * Acontece de verdade: pra boa parte dos CEPs a transportadora cota as duas
 * faixas no mesmo valor, e a tela ficava com duas linhas, o mesmo preço nas
 * duas e a mais lenta em cima (a lista é ordenada por preço). Duas opções em
 * que uma é pior que a outra em tudo não é escolha — é uma pergunta sem
 * resposta errada e com resposta certa escondida, e quem lê rápido marca a
 * primeira e recebe depois à toa.
 *
 * Some a econômica, fica a expressa. Ninguém paga mais por isso: é o mesmo
 * número, e o preço continua sendo o que o Medusa cobra — esta função não
 * mexe em `preco`, só decide quem entra na lista.
 *
 * Preço diferente, as duas ficam: aí a pergunta existe mesmo (pagar mais pra
 * receber antes), e é da pessoa.
 *
 * A ECONÔMICA JÁ GRAVADA NO CARRINHO FICA, e some a expressa do mesmo preço
 * (`escolhida`, o id da opção do carrinho). É o que a sacola pendura quando
 * as duas são o mesmo serviço, grátis nas duas; escondê-la deixava o carrinho
 * com uma e a tela marcando a outra, e o resumo do passo 2 sem o frete.
 */
export function semEntregaEmpatada<T extends { id?: string; faixa: string | null; preco: number }>(
  opcoes: T[],
  escolhida: string | null = null
): T[] {
  const expressas = opcoes.filter((o) => o.faixa === "expressa")
  if (!expressas.length) return opcoes

  const empatada = (o: T) => o.faixa !== "expressa" && expressas.some((x) => x.preco === o.preco)
  const gravada = escolhida ? opcoes.find((o) => o.id === escolhida && empatada(o)) : undefined
  if (gravada) {
    return opcoes.filter((o) => o.faixa !== "expressa" || o.preco !== gravada.preco)
  }
  return opcoes.filter((o) => !empatada(o))
}
