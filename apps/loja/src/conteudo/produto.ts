/**
 * O TEXTO DAS SEÇÕES DA PDP, por produto.
 *
 * Tudo que a página de produto AFIRMA e que não vem do catálogo mora aqui:
 * o que o produto faz, quando o resultado aparece, o modo de uso, as
 * perguntas frequentes. Preço, foto, estoque e nome continuam saindo do
 * Medusa — o front exibe, não inventa.
 *
 * É POR HANDLE, e não um texto só pra loja inteira, porque cada produto tem
 * argumento próprio: o calendário de 90 dias é do Fator, e num óleo ele
 * seria mentira. Produto sem conteúdo aqui simplesmente não monta essas
 * seções — a dobra continua de pé e a página não fica com bloco vazio nem
 * com texto de outro produto.
 *
 * QUANDO O PAINEL EXISTIR, este arquivo vira a consulta que ele alimenta:
 * a assinatura de `conteudoDaPdp(handle)` é a mesma, muda só de onde os
 * dados saem. É por isso que ele devolve DADO PURO — sem JSX, sem
 * componente, sem HTML solto.
 *
 * REALCE DENTRO DO TEXTO: escreva *assim*. O `<Realce>` transforma em
 * <strong>. Não aceito HTML nesses campos de propósito — o dia em que isto
 * vier de um painel, HTML no campo de texto vira porta de XSS, e ninguém
 * lembra de sanitizar um campo que "sempre foi da equipe".
 */

import { pdpDoProduto } from "@/lib/pdp"

export type PassoDoTempo = {
  quando: string
  titulo: string
  texto: string
  /** O marco que a página quer que a pessoa persiga. Um só. */
  alvo?: boolean
}

export type ItemDaRotina = {
  /** handle no catálogo — foto, nome e preço saem de lá */
  handle: string
  /** "Passo 1 · limpa" */
  passo: string
  /** por que este produto está na rotina */
  para: string
}

export type Pergunta = { pergunta: string; resposta: string[] }

export type ConteudoDaPdp = {
  promessa?: {
    chapeu: string
    titulo: string
    itens: string[]
    rodape?: string
  }
  tempo?: {
    titulo: string
    passos: PassoDoTempo[]
    aviso?: string
  }
  faixa?: {
    chapeu: string
    titulo: string
    texto: string
    chamada: string
    /** handle do produto cuja foto vira o fundo da faixa */
    fotoDe: string
  }
  rotina?: {
    titulo: string
    /** o produto DESTA página entra sozinho; não repita ele aqui */
    itens: ItemDaRotina[]
  }
  funciona?: {
    comoTitulo: string
    comoFotoDe: string
    comoTexto: string[]
    usoTitulo: string
    usoFotoDe: string
    usoPassos: string[]
    dica?: string
  }
  versus?: {
    titulo: string
    nomeDeles: string
    descricaoDeles: string
    nosso: string[]
    deles: string[]
  }
  quem?: {
    titulo: string
    sim: string[]
    nao: string[]
  }
  duvidas?: {
    titulo: string
    perguntas: Pergunta[]
  }
}

/**
 * O conteúdo de um produto, lido do Medusa.
 *
 * ERA UM OBJETO ESCRITO AQUI. O texto do Fator de Crescimento — as oito
 * seções — vivia neste arquivo, e trocar uma frase era um deploy. Ele foi
 * pra dentro do produto, no `metadata`, e hoje se edita na própria página do
 * produto no admin. A semente da migração está em
 * `apps/backend/src/scripts/dados/pdp-inicial.json`, extraída deste arquivo
 * pra que a mudança de endereço não perdesse uma vírgula.
 *
 * O que ficou aqui são os TIPOS, que continuam sendo o contrato entre o
 * editor no admin e as seções da loja.
 *
 * É `async` agora, e por isso cada seção virou componente assíncrono. Não
 * custa oito buscas: `buscarProdutoPorHandle` é `"use cache"`, então as oito
 * chamadas de uma render são uma leitura só.
 */
export async function conteudoDaPdp(handle: string): Promise<ConteudoDaPdp> {
  return (await pdpDoProduto(handle)).conteudo
}
