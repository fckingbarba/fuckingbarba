import { dia, hora } from "../painel/formato"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * O E-MAIL DO CUPOM DA 1ª COMPRA — o que chega na hora do cadastro no pop-up
 * da loja (`lib/crm/primeira-compra.ts`): o cupom, o botão que já aplica o
 * desconto (`/discount/<código>`, o link de cupom da loja) e os produtos do
 * que a pessoa estava vendo.
 *
 * Tem desconto, então é oferta, no modelo da marca: Promoções é o lugar dele
 * (a lição da 0174 vale pros sem desconto).
 *
 * Código puro, com testes.
 */

export const PORQUE_DO_CADASTRO =
  "Você recebeu porque se cadastrou na loja pra ganhar o cupom da primeira compra."

export type CadastroDoEmail = {
  para: string
  /** O nome como a pessoa escreveu ("rafael silva"). O e-mail usa o primeiro. */
  nome: string | null
  cupom: { codigo: string; porcento: number; ate: Date }
  /** O título do bloco dos produtos ("Pra cuidar da barba"). */
  tituloDosProdutos: string
  produtos: ProdutoDoCrm[]
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

/** "rafael silva" → "Rafael". Vazio fica sem nome ("Oi!"). */
export function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? ""
  if (!primeiro) return null
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1)
}

export function emailDaPrimeiraCompra(c: CadastroDoEmail): EmailDoCrm {
  const vale = `${dia(c.cupom.ate)}, ${hora(c.cupom.ate)}`
  return {
    para: c.para,
    nome: primeiroNome(c.nome),
    campanha: "boas-vindas",
    assunto: `Seu cupom de ${c.cupom.porcento}% chegou`,
    previa: `${c.cupom.porcento}% na sua primeira compra, só seu. Vale até ${vale}.`,
    titulo: "Seu cupom chegou",
    texto:
      "Bem-vindo à FuckingBarba: barba e cabelo levados a sério, com fórmulas de alta " +
      "performance e sem enrolação. O cupom é só seu e vale na primeira compra.",
    botao: {
      texto: "Usar meu cupom",
      caminho: `/discount/${encodeURIComponent(c.cupom.codigo)}`,
    },
    blocos: [
      {
        tipo: "cupom",
        codigo: c.cupom.codigo,
        oque: `${c.cupom.porcento}% na primeira compra`,
        validade: `Só seu. Vale até ${vale}, uma vez.`,
      },
      ...(c.produtos.length
        ? [{ tipo: "produtos" as const, titulo: c.tituloDosProdutos, produtos: c.produtos }]
        : []),
      { tipo: "selo", texto: "Pix aprovado na hora · Cartão em até 3x sem juros" },
    ],
    porque: PORQUE_DO_CADASTRO,
    sair: c.sair,
    loja: c.loja,
    estilo: "oferta",
  }
}

/* ── a sequência das boas-vindas (entrega 0178) ─────────────────────────── */

/** A trilha de quem se cadastrou (`lib/crm/primeira-compra.ts`). */
export type TrilhaDoEmail = "crescimento" | "cuidado" | "cabelo" | "geral"

/**
 * Os produtos de que as trilhas falam, pelo endereço: o Fator (crescer), o
 * Kit Completo, o óleo e o balm (cuidar), e as duas pastas (cabelo).
 */
export const PRODUTOS_DAS_TRILHAS = {
  fator: "fator-de-crescimento-para-barba",
  kit: "kit-completo-para-barba",
  oleo: "oleo-para-barba",
  balm: "balm-para-barba",
  matte: "pasta-modeladora-matte-80g-fucking-barba",
  brilho: "pasta-modeladora-brilho-80g-fucking-barba",
} as const

/**
 * O que os e-mails usam da página de um produto (`fb_pdp`, `lib/pdp.ts`): a
 * linha do tempo, o modo de uso, as dúvidas e a promessa. É o texto que a
 * loja já mostra — os e-mails não inventam o que a página não diz.
 */
export type ConteudoDoProduto = {
  produto: ProdutoDoCrm
  /** "Fator de Crescimento", "pasta matte" — o nome curto, pra frase. */
  curto: string
  /** O artigo do nome curto: "o Fator de Crescimento", "a pasta matte". */
  artigo: "o" | "a"
  tempo: { titulo: string; passos: string[] } | null
  uso: { titulo: string; passos: string[]; dica: string | null } | null
  duvidas: { titulo: string; perguntas: { pergunta: string; resposta: string }[] } | null
  promessa: { titulo: string; itens: string[] } | null
}

export type ToqueDaSequencia =
  "boas-vindas-1d" | "boas-vindas-2d" | "boas-vindas-5d" | "boas-vindas-7d" | "boas-vindas-10d"

export type SequenciaDoEmail = {
  toque: ToqueDaSequencia
  trilha: TrilhaDoEmail
  para: string
  nome: string | null
  /** O cupom da 1ª compra (o do pop-up) — só o e-mail de 2 dias usa, e só se ainda vale. */
  cupom: { codigo: string; porcento: number; ate: Date } | null
  /** O conteúdo de cada produto das trilhas, pelo endereço (o que faltar, o e-mail não usa). */
  conteudos: ReadonlyMap<string, ConteudoDoProduto>
  /** O produto que a pessoa via quando se cadastrou, se for desta trilha. */
  visto: string | null
  /** Os produtos do bloco de produtos do e-mail do cupom. */
  produtos: ProdutoDoCrm[]
  /** As avaliações aprovadas do Fator (4 e 5 estrelas), pro de 1 dia de quem quer crescer. */
  depoimentos: { texto: string; quem: string; estrelas: number }[]
  /** Os links de escolha do "Barba ou cabelo?" (só a trilha geral). */
  escolhas: { crescimento: string; cuidado: string; cabelo: string } | null
  /** O que a loja diz de si, pras dúvidas de quem não viu produto. */
  daLoja: { prazoDePostagem: string | null; freteGratisAcima: number | null }
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

/** O texto das seções vem com *ênfase* (o negrito da página): no e-mail, sem as estrelas. */
export const semMarcas = (texto: string) => texto.replace(/\*([^*]+)\*/g, "$1").replace(/\*/g, "")

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const capital = (t: string) => t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1)
/** "o Fator de Crescimento", "a pasta matte". */
const com = (c: ConteudoDoProduto) => `${c.artigo} ${c.curto}`
/** "do Fator de Crescimento", "da pasta matte". */
const de = (c: ConteudoDoProduto) => `${c.artigo === "a" ? "da" : "do"} ${c.curto}`

/**
 * O E-MAIL DE CADA DIA DA TRILHA — ou null, quando a trilha não tem aquele dia
 * (o cabelo não tem o de 10 dias; quem não viu produto e não escolheu para
 * depois das dúvidas), ou quando falta o conteúdo (a página sem a seção). O
 * motor anota o dia sem e-mail como pulado.
 *
 * Os sem desconto são "lembrete" (a cara da marca, sem o cabeçalho de oferta
 * — a lição da 0176); o do cupom é "oferta".
 */
export function emailDaTrilha(s: SequenciaDoEmail): EmailDoCrm | null {
  const base = {
    para: s.para,
    nome: primeiroNome(s.nome),
    campanha: "boas-vindas",
    porque: PORQUE_DO_CADASTRO,
    sair: s.sair,
    loja: s.loja,
  }
  const c = (handle: string) => s.conteudos.get(handle) ?? null
  const H = PRODUTOS_DAS_TRILHAS
  const ver = (conteudo: ConteudoDoProduto) => ({
    texto: `Ver ${com(conteudo)}`,
    caminho: `/produtos/${encodeURIComponent(conteudo.produto.handle)}`,
  })
  const lembrete = (e: Omit<EmailDoCrm, keyof typeof base | "estilo">): EmailDoCrm => ({
    ...base,
    ...e,
    estilo: "lembrete",
  })

  /* O modo de uso da página do produto, com a dica dela. */
  const comoUsar = (p: ConteudoDoProduto | null): EmailDoCrm | null =>
    p?.uso?.passos.length
      ? lembrete({
          assunto: `Como usar ${com(p)} do jeito certo`,
          previa: "O passo a passo, e a dica que faz render.",
          titulo: p.uso.titulo,
          texto: p.uso.dica ?? "O passo a passo:",
          botao: ver(p),
          blocos: [{ tipo: "lista", itens: p.uso.passos.slice(0, 5) }],
        })
      : null

  /* As dúvidas da página do produto. */
  const duvidas = (p: ConteudoDoProduto | null): EmailDoCrm | null =>
    p?.duvidas?.perguntas.length
      ? lembrete({
          assunto: `As perguntas que todo mundo faz sobre ${com(p)}`,
          previa: "As que mais chegam pra gente, com a resposta.",
          titulo: p.duvidas.titulo,
          texto: "Separamos as que mais chegam pra gente.",
          botao: ver(p),
          blocos: [{ tipo: "perguntas", perguntas: p.duvidas.perguntas.slice(0, 4) }],
        })
      : null

  /* Dois produtos lado a lado, pela promessa de cada um (o óleo e o balm, as pastas). */
  const lado = (a: ConteudoDoProduto | null, b: ConteudoDoProduto | null) =>
    a?.promessa && b?.promessa
      ? [a, b].map((x) => ({
          pergunta: x.produto.nome,
          resposta: `${x.promessa!.itens.slice(0, 3).join(". ")}.`,
        }))
      : null

  if (s.toque === "boas-vindas-2d") {
    if (!s.cupom) return null
    const vale = `${dia(s.cupom.ate)}, ${hora(s.cupom.ate)}`
    return {
      ...base,
      assunto: `Seu cupom de ${s.cupom.porcento}% vence amanhã`,
      previa: `Vale até ${vale}, só na primeira compra.`,
      titulo: "O cupom vence amanhã",
      texto: `O seu cupom de ${s.cupom.porcento}% da primeira compra vale até ${vale}. Depois disso, ele some.`,
      botao: {
        texto: "Usar meu cupom",
        caminho: `/discount/${encodeURIComponent(s.cupom.codigo)}`,
      },
      blocos: [
        {
          tipo: "cupom",
          codigo: s.cupom.codigo,
          oque: `${s.cupom.porcento}% na primeira compra`,
          validade: `Só seu. Vale até ${vale}, uma vez.`,
        },
        ...(s.produtos.length
          ? [{ tipo: "produtos" as const, titulo: "Pra começar", produtos: s.produtos }]
          : []),
      ],
      estilo: "oferta",
    }
  }

  switch (s.trilha) {
    case "crescimento": {
      const fator = c(H.fator)
      if (s.toque === "boas-vindas-1d")
        return fator?.tempo?.passos.length
          ? lembrete({
              assunto: `Quando o resultado ${de(fator)} aparece`,
              previa: "Do começo ao resultado cheio: o que esperar.",
              titulo: fator.tempo.titulo,
              texto:
                `${capital(com(fator))} age com o uso de todo dia. Olha o que esperar, do começo ao ` +
                "resultado cheio.",
              botao: ver(fator),
              blocos: [
                { tipo: "passos", passos: fator.tempo.passos.slice(0, 4) },
                ...s.depoimentos.slice(0, 2).map((d): BlocoDoCrm => ({ tipo: "depoimento", ...d })),
              ],
            })
          : null
      if (s.toque === "boas-vindas-5d") return comoUsar(fator)
      if (s.toque === "boas-vindas-7d") return duvidas(fator)
      return fator
        ? lembrete({
            assunto: "90 dias de tratamento pelo melhor preço",
            previa: "O resultado vem com o uso sem pausa.",
            titulo: "O tratamento inteiro",
            texto:
              `O resultado ${de(fator)} vem com o uso sem pausa. Com 3 unidades, você ` +
              "cobre o tratamento e paga o melhor preço por frasco.",
            botao: { texto: "Ver as unidades", caminho: ver(fator).caminho },
            blocos: [{ tipo: "produtos", produtos: [fator.produto] }],
          })
        : null
    }

    case "cuidado": {
      const kit = c(H.kit)
      const visto = (s.visto && c(s.visto)) || kit
      if (s.toque === "boas-vindas-1d")
        return kit?.uso?.passos.length
          ? lembrete({
              assunto: "A rotina da barba em 3 passos",
              previa: "Lavar, hidratar e modelar.",
              titulo: "A rotina da barba",
              texto: "Lavar, hidratar e modelar: é o que deixa a barba macia e no lugar todo dia.",
              botao: ver(kit),
              blocos: [{ tipo: "lista", itens: kit.uso.passos.slice(0, 4) }],
            })
          : null
      if (s.toque === "boas-vindas-5d") {
        const oleo = c(H.oleo)
        const balm = c(H.balm)
        const perguntas = lado(oleo, balm)
        return perguntas && oleo && balm
          ? lembrete({
              assunto: `${capital(oleo.curto)} ou ${balm.curto}: qual usar e quando`,
              previa: "O que cada um faz, e a ordem certa.",
              titulo: `${capital(oleo.curto)} ou ${balm.curto}`,
              texto: kit?.uso?.dica ?? "Cada um tem a sua hora. Olha o que cada um faz:",
              botao: kit ? ver(kit) : ver(oleo),
              blocos: [{ tipo: "perguntas", perguntas }],
            })
          : comoUsar(visto)
      }
      if (s.toque === "boas-vindas-7d") return duvidas(visto)
      return kit?.promessa
        ? lembrete({
            assunto: "A rotina completa num kit só",
            previa: "Shampoo, óleo e balm, numa caixa.",
            titulo: kit.promessa.titulo,
            texto: "Os três da rotina, juntos numa caixa só.",
            botao: ver(kit),
            blocos: [
              { tipo: "lista", itens: kit.promessa.itens.slice(0, 3) },
              { tipo: "produtos", produtos: [kit.produto] },
            ],
          })
        : null
    }

    case "cabelo": {
      const matte = c(H.matte)
      const brilho = c(H.brilho)
      const visto = (s.visto && c(s.visto)) || matte
      if (s.toque === "boas-vindas-1d") {
        const perguntas = lado(matte, brilho)
        return perguntas
          ? lembrete({
              assunto: "Matte ou brilho: qual combina com você",
              previa: "O que muda de uma pra outra é o acabamento.",
              titulo: "Matte ou brilho",
              texto: "O que muda de uma pra outra é o acabamento. Olha a diferença:",
              botao: { texto: "Ver os de cabelo", caminho: "/para-cabelo" },
              blocos: [{ tipo: "perguntas", perguntas }],
            })
          : comoUsar(visto)
      }
      if (s.toque === "boas-vindas-5d") return comoUsar(visto)
      if (s.toque === "boas-vindas-7d") return duvidas(visto)
      return null
    }

    case "geral":
      if (s.toque === "boas-vindas-1d")
        return s.escolhas
          ? lembrete({
              assunto: "Barba ou cabelo?",
              previa: "Conta pra gente, e os próximos e-mails falam do que te interessa.",
              titulo: "O que você quer resolver?",
              texto: "Conta pra gente, e os próximos e-mails falam do que te interessa.",
              blocos: [
                {
                  tipo: "escolhas",
                  itens: [
                    { texto: "Encher as falhas da barba", href: s.escolhas.crescimento },
                    { texto: "Cuidar da barba", href: s.escolhas.cuidado },
                    { texto: "Arrumar o cabelo", href: s.escolhas.cabelo },
                  ],
                },
              ],
            })
          : null
      if (s.toque === "boas-vindas-5d")
        return lembrete({
          assunto: "As perguntas que todo mundo faz",
          previa: "Prazo, frete, pagamento e troca.",
          titulo: "Perguntas que todo mundo faz",
          texto: "Separamos as que mais chegam pra gente.",
          botao: { texto: "Conhecer a loja", caminho: "/" },
          blocos: [
            {
              tipo: "perguntas",
              perguntas: [
                ...(s.daLoja.prazoDePostagem
                  ? [
                      {
                        pergunta: "Em quanto tempo chega?",
                        resposta:
                          `A gente posta em ${s.daLoja.prazoDePostagem} depois do pagamento, e o ` +
                          "prazo da entrega pro seu CEP aparece no checkout.",
                      },
                    ]
                  : []),
                ...(s.daLoja.freteGratisAcima
                  ? [
                      {
                        pergunta: "O frete é grátis?",
                        resposta: `É, pra compras a partir de ${REAIS.format(s.daLoja.freteGratisAcima)}.`,
                      },
                    ]
                  : []),
                {
                  pergunta: "Como eu pago?",
                  resposta: "No Pix, aprovado na hora, ou no cartão em até 3x sem juros.",
                },
                {
                  pergunta: "E se eu não gostar?",
                  resposta: "Você tem 7 dias depois de receber pra trocar ou devolver.",
                },
              ],
            },
          ],
        })
      return null
  }
}
