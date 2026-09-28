import { dia, hora } from "../painel/formato"
import type { EmailDoCrm, ProdutoDoCrm } from "./crm"

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
