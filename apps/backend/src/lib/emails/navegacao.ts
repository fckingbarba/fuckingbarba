import { primeiroNome, type ConteudoDoProduto } from "./boas-vindas"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * OS E-MAILS DA NAVEGAÇÃO ABANDONADA (entrega 0198) — de quem mostrou
 * interesse num produto e não pôs nada na sacola (`lib/crm/navegacao.ts`),
 * contados da hora do interesse:
 *
 *   - 3 horas: "Ficou de olho no …?" — o produto, o que os clientes acharam
 *     (as avaliações aprovadas, de 4 e 5 estrelas) e as dúvidas da página
 *     dele. Sem nenhum dos dois, o dia fica sem e-mail;
 *   - 24 horas: "Quem levou o … também levou…" — a rotina completa (a matriz
 *     do plano, `sugestoesDaRotina`: o óleo pra quem olhou o Fator, o Kit
 *     Completo pra quem olhou um cuidado, e os 3 Fatores, o preço de 3
 *     unidades). Sem o que sugerir, fica sem e-mail.
 *
 * Sem desconto: LEMBRETE, na cara da loja, sem emoji e sem palavra de
 * propaganda. Código puro, com testes.
 */

export type ToqueDaNavegacaoNoEmail = "navegacao-3h" | "navegacao-24h"

export type NavegacaoDoEmail = {
  toque: ToqueDaNavegacaoNoEmail
  para: string
  /** O nome como veio (a conta, a newsletter). O e-mail usa o primeiro. */
  nome: string | null
  /** O produto que a pessoa olhou: o texto da página dele. */
  produto: ConteudoDoProduto | null
  /** O que os clientes acharam dele (aprovadas, 4 e 5 estrelas, as mais novas). */
  depoimentos: { texto: string; quem: string; estrelas: number }[]
  /** O que completa a rotina (o de 24 horas). */
  sugestoes: ProdutoDoCrm[]
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

export function emailDaNavegacao(n: NavegacaoDoEmail): EmailDoCrm | null {
  const p = n.produto
  if (!p) return null
  const o = `${p.artigo} ${p.curto}`
  const no = `${p.artigo === "a" ? "na" : "no"} ${p.curto}`
  const doProduto = `${p.artigo === "a" ? "da" : "do"} ${p.curto}`
  const base = {
    para: n.para,
    nome: primeiroNome(n.nome),
    campanha: "navegacao",
    porque: `Você recebeu porque viu ${o} na FuckingBarba.`,
    botao: { texto: `Ver ${o}`, caminho: `/produtos/${encodeURIComponent(p.produto.handle)}` },
    sair: n.sair,
    loja: n.loja,
    estilo: "lembrete" as const,
  }

  switch (n.toque) {
    case "navegacao-3h": {
      const depoimentos = n.depoimentos.slice(0, 3)
      const perguntas = p.duvidas?.perguntas.slice(0, 3) ?? []
      if (!depoimentos.length && !perguntas.length) return null
      const blocos: BlocoDoCrm[] = [
        { tipo: "produtos", produtos: [p.produto] },
        ...depoimentos.map((d): BlocoDoCrm => ({
          tipo: "depoimento",
          texto: d.texto,
          quem: d.quem,
          estrelas: d.estrelas,
        })),
        ...(perguntas.length
          ? [{ tipo: "perguntas" as const, titulo: p.duvidas?.titulo, perguntas }]
          : []),
      ]
      const oQue =
        depoimentos.length && perguntas.length
          ? `o que os clientes acharam ${doProduto} e as dúvidas que mais chegam sobre ${p.artigo === "a" ? "ela" : "ele"}.`
          : depoimentos.length
            ? `o que os clientes acharam ${doProduto}.`
            : `as dúvidas que mais chegam sobre ${o}, com as respostas.`
      return {
        ...base,
        assunto: `Ficou de olho ${no}?`,
        previa: depoimentos.length
          ? "O que os clientes acharam, e as dúvidas que mais chegam."
          : "As dúvidas que mais chegam, com as respostas.",
        titulo: "Ficou de olho?",
        texto: `Separamos ${oQue}`,
        blocos,
      }
    }
    case "navegacao-24h": {
      if (!n.sugestoes.length) return null
      return {
        ...base,
        assunto: `Quem levou ${o} também levou…`,
        previa: "O que completa a rotina.",
        titulo: "A rotina completa",
        texto: `Quem levou ${o} também levou estes, pra completar a rotina:`,
        blocos: [{ tipo: "produtos", produtos: [p.produto, ...n.sugestoes].slice(0, 3) }],
      }
    }
  }
}
