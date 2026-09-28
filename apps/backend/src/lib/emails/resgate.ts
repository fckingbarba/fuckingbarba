import { dia, hora } from "../painel/formato"
import { primeiroNome } from "./boas-vindas"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * OS E-MAILS DO RESGATE E DO SUNSET (entrega 0192) — de quem passou do dia
 * de comprar de novo (`lib/crm/resgate.ts`), contados desse dia:
 *
 *   - no dia: "Tá tudo bem com a barba?", com os 4 botões do plano (escolha
 *     do dono, 28/09): "Tá caro", "Esqueci de repor", "Não vi resultado" e
 *     "Comprei em outro lugar". É um LEMBRETE: sem desconto, assinado, e sem
 *     palavra de propaganda;
 *   - 7 dias: 15% pra voltar — só pra quem não respondeu (OFERTA: o cupom é
 *     o lugar de Promoções), com o "Refazer o pedido" já com o desconto;
 *   - 9 dias: o cupom vence amanhã;
 *   - 45 dias, sem sinal nenhum: "Quer continuar recebendo?" (o sunset), com
 *     o "Sim, quero continuar". Outro lembrete.
 *
 * O dia sem o que mostrar (sem os links, sem cupom) não tem e-mail: o motor
 * anota como pulado. Código puro, com testes.
 */

export type ToqueDoResgateNoEmail = "resgate-agora" | "resgate-7d" | "resgate-9d" | "resgate-45d"

/** Os botões da pergunta do dia (as respostas de `lib/crm/resgate.ts`, menos o "sim"). */
export type BotoesDoResgate = { caro: string; esqueci: string; resultado: string; outro: string }

export type ResgateDoEmail = {
  toque: ToqueDoResgateNoEmail
  para: string
  /** O nome como veio (a conta, a loja antiga). O e-mail usa o primeiro. */
  nome: string | null
  /** O que acabou, pela conta dos dias ("o Fator de Crescimento"); sem ela, `null`. */
  acabou: { curto: string; artigo: "o" | "a" } | null
  /** O de sempre: os produtos da última compra. */
  produtos: ProdutoDoCrm[]
  /** Os 4 botões da pergunta (o de hoje). */
  botoes: BotoesDoResgate | null
  /** O "Sim, quero continuar" do sunset (o de 45 dias). */
  sim: string | null
  /** O cupom de 15% (os de 7 e 9 dias). */
  cupom: { codigo: string; porcento: number; ate: Date } | null
  /** O "Refazer o pedido" (`/voltar/<t>`): a última compra, num carrinho novo. */
  voltar: string | null
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

export function emailDoResgate(r: ResgateDoEmail): EmailDoCrm | null {
  const base = {
    para: r.para,
    nome: primeiroNome(r.nome),
    campanha: "resgate",
    porque: "Você recebeu porque comprou na FuckingBarba.",
    sair: r.sair,
    loja: r.loja,
  }
  const o = r.acabou ? `${r.acabou.artigo} ${r.acabou.curto}` : null
  const deSempre: BlocoDoCrm[] = r.produtos.length
    ? [{ tipo: "produtos", titulo: "O de sempre", produtos: r.produtos.slice(0, 3) }]
    : []

  switch (r.toque) {
    case "resgate-agora":
      if (!r.botoes) return null
      return {
        ...base,
        estilo: "lembrete",
        assunto: "Tá tudo bem com a barba?",
        previa: "Conta pra gente o que aconteceu: é só escolher.",
        titulo: "Tá tudo bem?",
        texto:
          (o
            ? `Pelas nossas contas, ${o} da sua última compra acabou faz umas semanas, e você não repôs. `
            : "Faz um tempo que você não compra na FuckingBarba. ") +
          "Conta pra gente o que aconteceu — é só escolher:",
        blocos: [
          {
            tipo: "escolhas",
            itens: [
              { texto: "💸 Tá caro", href: r.botoes.caro },
              { texto: "🤦 Esqueci de repor", href: r.botoes.esqueci },
              { texto: "🤔 Não vi resultado", href: r.botoes.resultado },
              { texto: "🛒 Comprei em outro lugar", href: r.botoes.outro },
            ],
          },
        ],
      }
    case "resgate-7d":
    case "resgate-9d": {
      const c = r.cupom
      if (!c) return null
      const vale = `${dia(c.ate)}, ${hora(c.ate)}`
      const botao = r.voltar
        ? {
            texto: `Refazer o pedido com ${c.porcento}%`,
            caminho: `${r.voltar}?cupom=${encodeURIComponent(c.codigo)}`,
          }
        : { texto: "Usar meu cupom", caminho: `/discount/${encodeURIComponent(c.codigo)}` }
      const blocos: BlocoDoCrm[] = [
        {
          tipo: "cupom",
          codigo: c.codigo,
          oque: `${c.porcento}% na loja toda`,
          validade: `Só seu. Vale até ${vale}, uma vez.`,
        },
        ...deSempre,
      ]
      if (r.toque === "resgate-9d")
        return {
          ...base,
          estilo: "oferta",
          assunto: `Seu cupom de ${c.porcento}% vence amanhã`,
          previa: `Vale até ${vale}.`,
          titulo: "O cupom vence amanhã",
          texto: `O seu cupom de ${c.porcento}% vale até ${vale}. Depois disso, ele some.`,
          botao,
          blocos,
        }
      return {
        ...base,
        estilo: "oferta",
        assunto: `${c.porcento}% pra voltar pra rotina`,
        previa: `Um cupom só seu, que vale até ${vale}.`,
        titulo: `${c.porcento}% pra voltar`,
        texto:
          `Pra você voltar pra rotina, um cupom de ${c.porcento}% na loja toda, só seu. ` +
          (r.voltar
            ? "O botão monta o pedido de sempre, já com o desconto."
            : "O botão leva pra loja com o desconto guardado."),
        botao,
        blocos,
      }
    }
    case "resgate-45d":
      if (!r.sim) return null
      return {
        ...base,
        estilo: "lembrete",
        assunto: "Quer continuar recebendo nossos e-mails?",
        previa: "Se não, a gente para por aqui.",
        titulo: "Quer continuar?",
        texto:
          "Faz tempo que a gente não se fala. Pra não encher a sua caixa, vamos parar de mandar " +
          "e-mails pra você — a não ser que você queira continuar. Os e-mails dos seus pedidos " +
          "continuam chegando.",
        blocos: [{ tipo: "escolhas", itens: [{ texto: "Sim, quero continuar", href: r.sim }] }],
      }
  }
}
