import type { IdDoToque } from "../crm/fluxos"
import { dia, hora } from "../painel/formato"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * OS E-MAILS DOS FLUXOS DE COMPRA — o Pix pendente, o checkout abandonado e o
 * carrinho abandonado, um por toque (`lib/crm/fluxos.ts`), no modelo do CRM
 * (`lib/emails/crm.ts`).
 *
 * O botão de todos é o LINK DE VOLTAR (`lib/crm/voltar.ts`): põe o carrinho
 * de volta, do jeito que estava, ou monta um novo com os produtos do Pix que
 * venceu — e cai no checkout. Com cupom, o link leva o código, e o checkout
 * aplica sozinho.
 *
 * O pé diz por que a pessoa recebeu (ela começou uma compra), com o sair da
 * lista de sempre.
 *
 * Código puro, com testes.
 */

export type ItemDoFluxo = ProdutoDoCrm & { quantidade: number }

export type CompraDoFluxo = {
  toque: IdDoToque
  para: string
  nome: string | null
  itens: ItemDoFluxo[]
  /** O número do pedido do Pix (3312). */
  numero: number | null
  /** O Pix que ainda vale — só no aviso de vencer. */
  pix: { codigo: string; imagem: string | null; vence: Date } | null
  /** O cupom que este toque deu, ou o que o de 24 horas deu (nos de depois). */
  cupom: { codigo: string; porcento: number; ate: Date } | null
  /**
   * As avaliações de verdade (aprovadas no painel) de um produto da sacola —
   * no e-mail de 12 horas do carrinho. Sem nenhuma, ele fala do jeito de comprar.
   */
  depoimentos?: { texto: string; quem: string; estrelas: number }[]
  /** O `t` do link de voltar. */
  voltar: string
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

export const PORQUE_DA_COMPRA = "Você recebeu porque começou uma compra na FuckingBarba."

const COMO_PAGA = "Pix aprovado na hora · Cartão em até 3x sem juros"

/** "29/09, 15:30" — em Brasília. */
const quando = (d: Date) => `${dia(d)}, ${hora(d)}`

/** O primeiro produto, pra frase: "o Fator de Crescimento", ou "o seu pedido" com mais de um. */
function oQue(itens: ItemDoFluxo[]): string {
  if (itens.length === 1) return `o ${itens[0].nome}`
  return "o seu pedido"
}

/**
 * O e-mail de um toque, já com o estilo que decide a aba do Gmail
 * (`EmailDoCrm.estilo`): o aviso do Pix tem a cara de e-mail de pedido; o que
 * dá desconto é oferta (Promoções é o lugar dele); o resto é lembrete — a cara
 * da marca, sem o cabeçalho de oferta e com o nome de quem assina (0176: o
 * teste da cara padrão; se cair em Promoções, volta pro "pessoal", o texto
 * simples).
 */
export function emailDoFluxo(c: CompraDoFluxo): EmailDoCrm {
  const e = montar(c)
  if (c.toque === "pix-vence")
    return {
      ...e,
      estilo: "pedido",
      porque: c.numero
        ? `Você recebeu porque fez o pedido #${c.numero} na FuckingBarba.`
        : "Você recebeu porque fez um pedido na FuckingBarba.",
    }
  if (e.blocos.some((b) => b.tipo === "cupom")) return { ...e, estilo: "oferta" }
  // O de 4 horas pergunta se ficou dúvida: na cara da marca, ele diz onde tirar.
  const blocos =
    c.toque === "checkout-4h"
      ? [...e.blocos, { tipo: "texto" as const, texto: ondeTirarDuvida(c.loja) }]
      : e.blocos
  return { ...e, blocos, estilo: "lembrete" }
}

/** Onde a pessoa tira a dúvida: a resposta do e-mail (vai pro atendimento), o WhatsApp do pé ou a página de contato. */
function ondeTirarDuvida(loja: CompraDoFluxo["loja"]): string {
  const pergunta = "Dúvida de uso, de prazo ou de pagamento?"
  if (loja.atendimento) return `${pergunta} É só responder este e-mail.`
  if (loja.whatsapp) return `${pergunta} O nosso WhatsApp está no pé deste e-mail.`
  return `${pergunta} A página de contato da loja responde rápido.`
}

function montar(c: CompraDoFluxo): EmailDoCrm {
  const fluxo = c.toque.startsWith("pix")
    ? "pix"
    : c.toque.startsWith("carrinho")
      ? "carrinho"
      : "checkout"
  const produtos: BlocoDoCrm = {
    tipo: "produtos",
    titulo:
      fluxo === "carrinho"
        ? "O que você escolheu"
        : c.itens.length === 1
          ? "O seu pedido"
          : "Os produtos do seu pedido",
    produtos: c.itens,
  }
  const selo: BlocoDoCrm = { tipo: "selo", texto: COMO_PAGA }
  const voltar = `/voltar/${c.voltar}`
  const comCupom = c.cupom ? `${voltar}?cupom=${encodeURIComponent(c.cupom.codigo)}` : voltar
  const blocoDoCupom: BlocoDoCrm[] = c.cupom
    ? [
        {
          tipo: "cupom",
          codigo: c.cupom.codigo,
          oque: `${c.cupom.porcento}% no pedido`,
          validade: `Só seu. Vale até ${quando(c.cupom.ate)}, uma vez.`,
        },
      ]
    : []
  const pedido = c.numero ? `do pedido #${c.numero}` : "do seu pedido"
  const refazer = fluxo === "pix"
  const base = {
    para: c.para,
    nome: c.nome,
    campanha: fluxo,
    porque: PORQUE_DA_COMPRA,
    sair: c.sair,
    loja: c.loja,
  }
  const botao = (texto: string, caminho = voltar) => ({ texto, caminho })

  switch (c.toque) {
    case "pix-vence": {
      const vence = c.pix ? hora(c.pix.vence) : null
      return {
        ...base,
        assunto: vence ? `Seu Pix vence às ${vence}` : "Seu Pix vence daqui a pouco",
        previa: `Pague ${pedido} pelo app do banco, com o código copia e cola.`,
        titulo: "Seu Pix vence daqui a pouco",
        texto:
          `O Pix ${pedido} vale ${vence ? `até as ${vence}` : "por pouco tempo"}. Depois disso ele ` +
          "vence e o pedido é cancelado. Pra pagar, é só usar o código abaixo no app do banco.",
        blocos: [
          ...(c.pix
            ? [
                {
                  tipo: "pix" as const,
                  codigo: c.pix.codigo,
                  imagem: c.pix.imagem,
                  vence: quando(c.pix.vence),
                },
              ]
            : []),
          produtos,
        ],
      }
    }
    case "checkout-30min":
      return {
        ...base,
        assunto: "Faltou só o pagamento",
        previa: "O seu pedido está montado. É só voltar e pagar.",
        titulo: "Faltou só o pagamento",
        texto:
          "Você montou o pedido e parou no último passo. Está tudo guardado do jeito que você " +
          "deixou: é só voltar e pagar.",
        botao: botao("Voltar pro pagamento"),
        blocos: [produtos, selo],
      }
    case "checkout-4h":
      return {
        ...base,
        assunto: "Ficou alguma dúvida?",
        previa: "Pix na hora, 3x sem juros no cartão e 7 dias pra trocar.",
        titulo: "Ficou alguma dúvida?",
        texto:
          `Se travou em alguma coisa, a gente resolve. ${oQue(c.itens).replace(/^o /, "O ")} ` +
          "continua guardado do jeito que você deixou.",
        botao: botao("Voltar pro pagamento"),
        blocos: [
          {
            tipo: "passos",
            titulo: "Como funciona",
            passos: [
              "Pix aprovado na hora",
              "Cartão em até 3x sem juros",
              "7 dias pra trocar ou devolver",
            ],
          },
          produtos,
        ],
      }
    case "checkout-24h":
    case "pix-24h":
      if (c.cupom)
        return {
          ...base,
          assunto: refazer
            ? `${c.cupom.porcento}% pra você refazer o pedido`
            : `${c.cupom.porcento}% pra você fechar o pedido`,
          previa: `O desconto é só seu e vale até ${quando(c.cupom.ate)}.`,
          titulo: "Um desconto pra fechar",
          texto: refazer
            ? `O Pix ${pedido} venceu e o pedido foi cancelado — nada foi cobrado. Se ainda ` +
              "quiser, a gente refaz com os mesmos produtos e um desconto só seu."
            : "Seu pedido continua guardado. Pra ajudar a decidir, separamos um desconto só pra você.",
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: refazer ? "Quer refazer o seu pedido?" : "Seu pedido continua guardado",
        previa: refazer
          ? "Os mesmos produtos, num Pix novo."
          : "Do jeito que você deixou. É só voltar e pagar.",
        titulo: refazer ? "Quer refazer o seu pedido?" : "Seu pedido continua guardado",
        texto: refazer
          ? `O Pix ${pedido} venceu e o pedido foi cancelado — nada foi cobrado. Se ainda ` +
            "quiser, a gente refaz com os mesmos produtos."
          : "Guardamos o seu pedido do jeito que você deixou. É só voltar e pagar.",
        botao: botao(refazer ? "Refazer o pedido" : "Voltar pro pagamento"),
        blocos: [produtos, selo],
      }
    case "checkout-48h":
    case "pix-48h":
      if (c.cupom)
        return {
          ...base,
          assunto: `Seu desconto de ${c.cupom.porcento}% vence em breve`,
          previa: `Vale até ${quando(c.cupom.ate)}. Depois, a gente para de falar desse pedido.`,
          titulo: "O desconto vence em breve",
          texto:
            `O seu desconto de ${c.cupom.porcento}% vale até ${quando(c.cupom.ate)}. Depois ` +
            "disso, a gente para de falar desse pedido.",
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: "O último lembrete do seu pedido",
        previa: "Depois deste, a gente não fala mais desse pedido.",
        titulo: "O último lembrete",
        texto:
          "Este é o último lembrete: depois dele, a gente não fala mais desse pedido. Se ainda " +
          (refazer
            ? "quiser, a gente refaz com os mesmos produtos."
            : "quiser, está tudo guardado."),
        botao: botao(refazer ? "Refazer o pedido" : "Voltar pro pagamento"),
        blocos: [produtos, selo],
      }
    case "carrinho-1h":
      return {
        ...base,
        assunto: "Sua compra ficou pela metade",
        previa: "O que você escolheu continua separado na sacola.",
        titulo: "Sua compra ficou pela metade",
        texto:
          `Você escolheu ${oQueNaSacola(c.itens)} e parou antes de fechar a compra. Está tudo ` +
          "separado do jeito que você deixou: é só voltar e terminar.",
        botao: botao("Terminar a compra"),
        blocos: [produtos, selo],
      }
    case "carrinho-12h": {
      const depoimentos = (c.depoimentos ?? []).slice(0, 2)
      const primeiro = c.itens[0]?.nome.replace(/ · \d+ unidades$/, "")
      return {
        ...base,
        assunto: primeiro ? `Sobre o ${primeiro} que você escolheu` : "Sobre o que você escolheu",
        previa: depoimentos.length
          ? "O que quem já usa contou pra gente."
          : "Pix na hora, 3x sem juros no cartão e 7 dias pra trocar.",
        titulo: "Sobre o que você escolheu",
        texto: depoimentos.length
          ? "Separei o que quem já usa contou pra gente. A sua compra continua do jeito que você deixou."
          : "A sua compra continua do jeito que você deixou. E se ficou alguma dúvida, olha como funciona.",
        botao: botao("Terminar a compra"),
        blocos: [
          ...(depoimentos.length
            ? depoimentos.map((d): BlocoDoCrm => ({
                tipo: "depoimento",
                texto: d.texto,
                quem: d.quem,
                estrelas: d.estrelas,
              }))
            : [
                {
                  tipo: "passos" as const,
                  titulo: "Como funciona",
                  passos: [
                    "Pix aprovado na hora",
                    "Cartão em até 3x sem juros",
                    "7 dias pra trocar ou devolver",
                  ],
                },
              ]),
          produtos,
        ],
      }
    }
    case "carrinho-24h":
      if (c.cupom)
        return {
          ...base,
          assunto: `${c.cupom.porcento}% pra você decidir`,
          previa: `O desconto é só seu e vale até ${quando(c.cupom.ate)}.`,
          titulo: "Um desconto pra decidir",
          texto:
            "A sua sacola continua guardada. Pra ajudar a decidir, separamos um desconto só pra você.",
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: "Sua compra continua separada",
        previa: "Do jeito que você deixou. É só voltar e terminar.",
        titulo: "Sua compra continua separada",
        texto: "A sua compra continua separada do jeito que você deixou. É só voltar e terminar.",
        botao: botao("Terminar a compra"),
        blocos: [produtos, selo],
      }
    case "carrinho-3d":
      if (c.cupom)
        return {
          ...base,
          assunto: `Seu desconto de ${c.cupom.porcento}% vence amanhã`,
          previa: `Vale até ${quando(c.cupom.ate)}.`,
          titulo: "O desconto vence amanhã",
          texto: `O seu desconto de ${c.cupom.porcento}% vale até ${quando(c.cupom.ate)}. A sacola continua guardada.`,
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: "Seus produtos continuam separados",
        previa: "É só voltar e terminar a compra.",
        titulo: "Seus produtos continuam separados",
        texto:
          "O que você escolheu continua separado do jeito que você deixou. É só voltar e terminar a compra.",
        botao: botao("Terminar a compra"),
        blocos: [produtos, selo],
      }
    case "carrinho-5d":
      return {
        ...base,
        assunto: "O último lembrete da sua compra",
        previa: "Depois deste, a gente não fala mais dela.",
        titulo: "O último lembrete",
        texto:
          "Este é o último lembrete: depois dele, a gente não fala mais desta compra. Se ainda " +
          "quiser, está tudo separado.",
        botao: botao("Terminar a compra"),
        blocos: [produtos, selo],
      }
  }
}

/** "o Fator de Crescimento" com um produto; "uns produtos" com mais. */
function oQueNaSacola(itens: ItemDoFluxo[]): string {
  if (itens.length === 1) return `o ${itens[0].nome.replace(/ · \d+ unidades$/, "")}`
  return "uns produtos"
}
