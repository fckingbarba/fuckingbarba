import { primeiroNome } from "./boas-vindas"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * OS E-MAILS DA REPOSIÇÃO (entrega 0185) — o produto que a pessoa comprou
 * está pra acabar (`lib/crm/reposicao.ts`): 7 e 2 dias antes, 3 e 10 dias
 * depois do dia em que ele acaba. Todos com o "Refazer o pedido", que monta
 * a sacola igual à da última compra e cai no checkout (o link de voltar).
 *
 * Sem desconto, e útil pra pessoa: todos são LEMBRETE (a cara da marca,
 * assinado, sem o cabeçalho de oferta), e sem palavra de propaganda — a
 * lição da 0174. O de 7 dias mostra também o que dura mais (3 Fatores, o
 * Kit Completo), sem prometer resultado. Quando o de sempre é um kit, todos
 * mostram também o produto sozinho ("Só o shampoo", 0229).
 *
 * Código puro, com testes.
 */

export type ToqueDaReposicao =
  "reposicao-antes-7d" | "reposicao-antes-2d" | "reposicao-depois-3d" | "reposicao-depois-10d"

export type ReposicaoDoEmail = {
  toque: ToqueDaReposicao
  para: string
  /** O nome como veio (a conta, a loja antiga). O e-mail usa o primeiro. */
  nome: string | null
  /** O que acaba, com o artigo: "o Fator de Crescimento", "a pasta modeladora". */
  acabando: { curto: string; artigo: "o" | "a" }
  /** O de sempre: os produtos da última compra que trazem esse tipo. */
  produtos: ProdutoDoCrm[]
  /** O que dura mais, no e-mail de 7 dias: 3 Fatores, o Kit Completo. */
  subirPara: ProdutoDoCrm | null
  /**
   * O produto sozinho, quando o de sempre é um kit (0229): "Só o shampoo" pra
   * quem levou o Kit Completo — o que acaba primeiro. Em todos os toques.
   */
  soEle?: ProdutoDoCrm[]
  /** O caminho do "Refazer o pedido" na loja (`/voltar/<t>`). */
  voltar: string
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

export function emailDaReposicao(r: ReposicaoDoEmail): EmailDoCrm {
  const { curto, artigo } = r.acabando
  const o = `${artigo} ${curto}`
  const seu = artigo === "a" ? "Sua" : "Seu"
  const doProduto = `${artigo === "a" ? "da" : "do"} ${curto}`
  const base = {
    para: r.para,
    nome: primeiroNome(r.nome),
    campanha: "reposicao",
    porque: `Você recebeu porque comprou ${o} na FuckingBarba.`,
    botao: { texto: "Refazer o pedido", caminho: r.voltar },
    sair: r.sair,
    loja: r.loja,
    estilo: "lembrete" as const,
  }
  const deSempre: BlocoDoCrm[] = [
    ...(r.produtos.length
      ? [{ tipo: "produtos" as const, titulo: "O de sempre", produtos: r.produtos.slice(0, 3) }]
      : []),
    ...(r.soEle?.length
      ? [{ tipo: "produtos" as const, titulo: `Só ${o}`, produtos: r.soEle.slice(0, 2) }]
      : []),
  ]

  switch (r.toque) {
    case "reposicao-antes-7d":
      return {
        ...base,
        assunto: `${seu} ${curto} acaba em uma semana`,
        previa: "Pelas nossas contas. O pedido de sempre fica pronto.",
        titulo: "Acaba em uma semana",
        texto:
          `Pelas nossas contas, ${o} da sua última compra acaba daqui a uns 7 dias. Pra não ` +
          "parar no meio, o botão abaixo monta o pedido igual ao da última vez.",
        blocos: [
          ...deSempre,
          ...(r.subirPara
            ? [{ tipo: "produtos" as const, titulo: "Pra durar mais", produtos: [r.subirPara] }]
            : []),
        ],
      }
    case "reposicao-antes-2d":
      return {
        ...base,
        assunto: `Não deixa ${o} acabar`,
        previa: "Faltam uns 2 dias, pelas nossas contas.",
        titulo: "Não deixa acabar",
        texto: `Pelas nossas contas, ${o} acaba em uns 2 dias. Repondo antes, a rotina segue sem pausa.`,
        blocos: deSempre,
      }
    case "reposicao-depois-3d":
      return {
        ...base,
        assunto: `Acabou ${o}?`,
        previa: "Se já repôs, pode ignorar.",
        titulo: "Acabou?",
        texto:
          `Pelas nossas contas, ${o} da sua última compra acabou há uns dias. Se já repôs, ` +
          "pode ignorar este e-mail. Se não, o botão abaixo monta o pedido de sempre.",
        blocos: deSempre,
      }
    case "reposicao-depois-10d":
      return {
        ...base,
        assunto: `O último lembrete ${doProduto}`,
        previa: "Depois deste, a gente não fala mais disso.",
        titulo: "O último lembrete",
        texto:
          `Este é o último lembrete sobre ${o}: depois dele, a gente não fala mais disso. Se ` +
          "quiser repor, o botão abaixo monta o pedido de sempre.",
        blocos: deSempre,
      }
  }
}
