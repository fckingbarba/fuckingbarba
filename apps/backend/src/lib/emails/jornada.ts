import { primeiroNome, type ConteudoDoProduto, type TrilhaDoEmail } from "./boas-vindas"
import type { EmailDoCrm, ProdutoDoCrm } from "./crm"
import { emailDoIndique, type IndiqueDoEmail } from "./indicacao"

/**
 * OS E-MAILS DA JORNADA DO RESULTADO (entrega 0187) — depois que o pedido
 * chega (`lib/crm/jornada.ts`). O texto é o da página de cada produto (o
 * modo de uso, a linha do tempo, as dúvidas): o e-mail não inventa, e sem a
 * seção na página, o dia fica sem e-mail.
 *
 * Sem desconto, e sobre a compra da pessoa: todos são LEMBRETE (a cara da
 * marca, assinado, sem o cabeçalho de oferta), e sem palavra de propaganda.
 * Menos os dois do indique um brother (0215, `lib/emails/indicacao.ts`), que
 * falam de desconto e são oferta.
 * O check-in de 7 dias tem só dois botões — "Tá indo bem" e "Tenho uma
 * dúvida"; nada de "não gostei" (escolha do dono). Sem emoji nos botões
 * (0197): emoji em botão tem cara de campanha.
 *
 * Código puro, com testes.
 */

export type ToqueDaJornada =
  | "jornada-chegou"
  | "jornada-3d"
  | "jornada-7d"
  | "jornada-indique"
  | "jornada-21d"
  | "jornada-indique-30d"
  | "jornada-60d"

export type JornadaDoEmail = {
  toque: ToqueDaJornada
  para: string
  /** O nome como veio (a conta, o pedido). O e-mail usa o primeiro. */
  nome: string | null
  /** O número do pedido, pro "porque" do pé. */
  numero: number | null
  /** O produto do pedido que tem o modo de uso e as dúvidas na página: o primeiro que tiver. */
  principal: ConteudoDoProduto | null
  /** O Fator, se veio no pedido: os e-mails de 3 e de 60 dias. */
  fator: ConteudoDoProduto | null
  /** O que completa a rotina (o de 21 dias). */
  sugestoes: ProdutoDoCrm[]
  /** Os dois botões do check-in (o de 7 dias). */
  checkin: { bem: string; duvida: string } | null
  /**
   * O link de quem indica (os de 10 e 40 dias) — só quando a pessoa está
   * gostando e o motor decidiu que é a vez dela; sem ele, o dia fica sem e-mail.
   */
  indique?: IndiqueDoEmail | null
  /** De que é o pedido (0217): o assunto do convite do indique. */
  trilha?: TrilhaDoEmail
  /** O produto do pedido, da mesma linha, na frase do convite ("o Fator de Crescimento"). */
  produtoDoIndique?: string | null
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

/** "o Fator de Crescimento", "a pasta modeladora". */
const oProduto = (c: ConteudoDoProduto) => `${c.artigo} ${c.curto}`
const paginaDo = (c: ConteudoDoProduto) => `/produtos/${encodeURIComponent(c.produto.handle)}`

export function emailDaJornada(j: JornadaDoEmail): EmailDoCrm | null {
  const base = {
    para: j.para,
    nome: primeiroNome(j.nome),
    campanha: "jornada",
    porque: j.numero
      ? `Você recebeu porque fez o pedido #${j.numero} na FuckingBarba.`
      : "Você recebeu porque comprou na FuckingBarba.",
    sair: j.sair,
    loja: j.loja,
    estilo: "lembrete" as const,
  }
  const p = j.principal
  const fator = j.fator

  switch (j.toque) {
    case "jornada-chegou":
      if (!p?.uso?.passos.length) return null
      return {
        ...base,
        assunto: `Chegou! Veja como usar ${oProduto(p)}`,
        previa: "O passo a passo, e a dica que faz render.",
        titulo: "Chegou!",
        texto: p.uso.dica ?? `O passo a passo pra usar ${oProduto(p)}:`,
        botao: { texto: "Ver a página do produto", caminho: paginaDo(p) },
        blocos: [{ tipo: "lista", titulo: p.uso.titulo, itens: p.uso.passos.slice(0, 5) }],
      }
    case "jornada-3d":
      if (!fator?.tempo?.passos.length) return null
      return {
        ...base,
        assunto: "O segredo é não pular dia",
        previa: "A linha do tempo do Fator, pra acompanhar.",
        titulo: "Não pula dia",
        texto:
          "O Fator é de todo dia, sem pausa: é assim que a página dele conta o tempo. Salva a " +
          "linha do tempo pra acompanhar:",
        botao: { texto: "Ver a página do Fator", caminho: paginaDo(fator) },
        blocos: [{ tipo: "lista", titulo: fator.tempo.titulo, itens: fator.tempo.passos }],
      }
    case "jornada-7d":
      if (!j.checkin) return null
      return {
        ...base,
        assunto: "Uma semana. Como tá indo?",
        previa: "Conta pra gente: é só escolher.",
        titulo: "Como tá indo?",
        texto: "Faz uma semana que o seu pedido chegou. Conta pra gente:",
        blocos: [
          {
            tipo: "escolhas",
            itens: [
              { texto: "Tá indo bem", href: j.checkin.bem },
              { texto: "Tenho uma dúvida", href: j.checkin.duvida },
            ],
          },
          ...(p?.duvidas?.perguntas.length
            ? [
                {
                  tipo: "perguntas" as const,
                  titulo: "As dúvidas que mais chegam",
                  perguntas: p.duvidas.perguntas.slice(0, 3),
                },
              ]
            : []),
        ],
      }
    case "jornada-indique":
    case "jornada-indique-30d":
      if (!j.indique) return null
      return emailDoIndique({
        toque: j.toque,
        para: j.para,
        nome: j.nome,
        indique: j.indique,
        trilha: j.trilha,
        produto: j.produtoDoIndique ?? null,
        sair: j.sair,
        loja: j.loja,
      })
    case "jornada-21d":
      if (!j.sugestoes.length) return null
      return {
        ...base,
        assunto: "Agora completa a rotina",
        previa: "O que falta pra rotina da barba ficar completa.",
        titulo: "A rotina completa",
        texto: "Pelo que você já tem, estes completam a rotina:",
        botao: {
          texto: "Ver na loja",
          caminho: `/produtos/${encodeURIComponent(j.sugestoes[0].handle)}`,
        },
        blocos: [{ tipo: "produtos", produtos: j.sugestoes.slice(0, 2) }],
      }
    case "jornada-60d":
      if (!fator?.tempo?.passos.length) return null
      return {
        ...base,
        assunto: "Dia 60: é aqui que muita gente desiste",
        previa: "Dois meses de Fator. A linha do tempo mostra o que vem depois.",
        titulo: "Dia 60",
        texto:
          "Dois meses de Fator. É nessa hora que muita gente para, e a linha do tempo da página " +
          "dele mostra o que vem depois:",
        botao: { texto: "Ver a página do Fator", caminho: paginaDo(fator) },
        blocos: [{ tipo: "lista", titulo: fator.tempo.titulo, itens: fator.tempo.passos }],
      }
  }
}
