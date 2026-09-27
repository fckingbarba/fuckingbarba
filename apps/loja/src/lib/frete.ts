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
 * NO EMPATE DE PREÇO, UMA ENTREGA SÓ — E FICA A ECONÔMICA.
 *
 * Acontece de verdade: pra boa parte dos CEPs a transportadora cota as duas
 * faixas no mesmo valor, e a tela ficava com duas linhas e o mesmo preço nas
 * duas. Empatadas no preço, elas empatam também no prazo: a econômica é a
 * mais barata e, entre as mais baratas, a mais rápida (`escolherFaixas`, no
 * backend) — se a expressa custa o mesmo, a econômica chega junto com ela.
 * Duas linhas iguais não são escolha, então uma sai.
 *
 * SAI A EXPRESSA, e não a econômica (era ao contrário até a entrega 0136).
 * Com a expressa gravada, três coisas davam errado: o cupom de frete grátis
 * "só na opção mais barata" mira a econômica e nunca entrava; a sacola já
 * pendurava a econômica, e o checkout mostrava a outra; e qualquer mudança
 * no carrinho (a oferta do passo 3, um "+") faz o Medusa cotar de novo a
 * entrega gravada pela faixa dela — a expressa volta como "a mais rápida",
 * que pode ser outro serviço, mais caro, e o frete saía de "Grátis" pra
 * R$ 21,90 sem a pessoa escolher nada. A econômica cotada de novo é sempre a
 * mais barata: não sobe à toa, e o frete grátis da loja continua nela.
 *
 * Ninguém paga mais nem espera mais por isso: é o mesmo número e o mesmo
 * prazo, e o preço continua sendo o que o Medusa cobra — esta função não
 * mexe em `preco`, só decide quem entra na lista. A expressa empatada que já
 * estava gravada (carrinho de antes) também sai: a tela cai na primeira
 * visível e o passo 2 grava ela (`components/checkout/entrega.tsx`).
 *
 * Preço diferente, as duas ficam: aí a pergunta existe mesmo (pagar mais pra
 * receber antes), e é da pessoa.
 */
export function semEntregaEmpatada<T extends { faixa: string | null; preco: number }>(
  opcoes: T[]
): T[] {
  const outras = opcoes.filter((o) => o.faixa !== "expressa")
  return opcoes.filter((o) => o.faixa !== "expressa" || !outras.some((x) => x.preco === o.preco))
}
