import type { IdDoToque } from "../crm/fluxos"
import { dia, hora } from "../painel/formato"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"

/**
 * OS E-MAILS DOS FLUXOS DE COMPRA — o checkout abandonado e o Pix pendente,
 * um por toque (`lib/crm/fluxos.ts`), no modelo do CRM (`lib/emails/crm.ts`).
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
  /** O cupom que este toque deu, ou o que o de 24 horas deu (no de 48). */
  cupom: { codigo: string; porcento: number; ate: Date } | null
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

export function emailDoFluxo(c: CompraDoFluxo): EmailDoCrm {
  const fluxo = c.toque.startsWith("pix") ? "pix" : "checkout"
  const produtos: BlocoDoCrm = {
    tipo: "produtos",
    titulo: c.itens.length === 1 ? "O seu pedido" : "Os produtos do seu pedido",
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
          {
            tipo: "texto",
            texto: c.loja.whatsapp
              ? "Dúvida de uso, de prazo ou de pagamento? O nosso WhatsApp está no pé deste e-mail."
              : "Dúvida de uso, de prazo ou de pagamento? A página de contato da loja responde rápido.",
          },
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
              "quiser, a gente refaz tudo em 1 clique, com um desconto só seu."
            : "Seu pedido continua guardado. Pra ajudar a decidir, separamos um desconto só pra você.",
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: refazer ? "Refaz o seu pedido em 1 clique" : "Seu pedido ainda tá aqui",
        previa: refazer
          ? "Os mesmos produtos, num Pix novo."
          : "Guardamos tudo do jeito que você deixou.",
        titulo: refazer ? "Refaz em 1 clique" : "Seu pedido ainda tá aqui",
        texto: refazer
          ? `O Pix ${pedido} venceu e o pedido foi cancelado — nada foi cobrado. Se ainda ` +
            "quiser, a gente refaz tudo em 1 clique."
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
          titulo: "Última chamada",
          texto:
            `O seu desconto de ${c.cupom.porcento}% vale até ${quando(c.cupom.ate)}. Depois ` +
            "disso, a gente para de falar desse pedido.",
          botao: botao("Usar meu desconto", comCupom),
          blocos: [...blocoDoCupom, produtos],
        }
      return {
        ...base,
        assunto: "Última chamada pro seu pedido",
        previa: "Depois deste, a gente para de falar desse pedido.",
        titulo: "Última chamada",
        texto:
          "Depois deste, a gente para de falar desse pedido. Se ainda quiser, " +
          (refazer ? "a gente refaz tudo em 1 clique." : "está tudo guardado."),
        botao: botao(refazer ? "Refazer o pedido" : "Voltar pro pagamento"),
        blocos: [produtos, selo],
      }
  }
}
