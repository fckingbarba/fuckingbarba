import type { SegmentoDaEstreia } from "../crm/estreia"
import { dia, hora } from "../painel/formato"
import { primeiroNome } from "./boas-vindas"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "./crm"
import { emReais } from "./moldura"

/**
 * OS E-MAILS DA ESTREIA (entrega 0181) — a loja nova pra base da Nuvemshop
 * (`lib/crm/estreia.ts`). Um e-mail por pessoa, de 4 jeitos:
 *   - quem está na hora de repor: o que está acabando, e a loja nova;
 *   - quem está no meio do tratamento: a loja nova;
 *   - quem sumiu: a loja nova e um cupom pra voltar;
 *   - quem nunca comprou: a loja nova e o cupom da 1ª compra.
 * E, 2 dias depois, o "vence amanhã" de quem ganhou cupom.
 *
 * O do tratamento e os dois com cupom são oferta (o "cancelar inscrição" no
 * cabeçalho): é campanha pra base inteira, e Promoções é o lugar dela. O de
 * repor não tem desconto e é útil pra pessoa: sai como LEMBRETE (escolha do
 * dono, 28/09, depois do teste em que os 4 caíram em Promoções), a cara dos
 * lembretes do checkout que caíram em Principal — assinado, sem o cabeçalho
 * de oferta e sem palavra de propaganda (nem o frete grátis).
 *
 * O que a loja nova tem sai das Configurações (o frete grátis, o prazo de
 * postagem) e do que a loja faz de verdade (a conta sem senha, o rastreio).
 *
 * Código puro, com testes.
 */

export type ToqueDaEstreia = "estreia-agora" | "estreia-2d"

export type EstreiaDoEmail = {
  toque: ToqueDaEstreia
  segmento: SegmentoDaEstreia
  para: string
  /** O nome como veio da loja antiga. O e-mail usa o primeiro. */
  nome: string | null
  /** O cupom do e-mail da loja nova (quem sumiu, quem nunca comprou), se saiu. */
  cupom: { codigo: string; porcento: number; ate: Date } | null
  /** O que a pessoa levou da última vez — ou, de quem nunca comprou, os mais pedidos. */
  produtos: ProdutoDoCrm[]
  /** O que está acabando (quem está na hora de repor), e o produto pra repor. */
  acabando: { curto: string; artigo: "o" | "a"; produto: ProdutoDoCrm | null } | null
  daLoja: { freteGratisAcima: number | null; prazoDePostagem: string | null }
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}

export const PORQUE_DA_ESTREIA =
  "Você recebeu porque aceitou receber as ofertas da FuckingBarba por e-mail, na loja antiga."

/** O do lembrete de repor: sem a palavra "ofertas". */
export const PORQUE_DO_LEMBRETE_DA_ESTREIA =
  "Você recebeu porque aceitou os e-mails da FuckingBarba na loja antiga."

/** "https://www.fuckingbarba.com.br" → "fuckingbarba.com.br". */
function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * O que a loja nova tem: o que ela faz de verdade, e o que as Configurações
 * dizem. No lembrete, sem o frete grátis: é palavra de propaganda.
 */
function oQueTem(e: EstreiaDoEmail, lembrete = false): BlocoDoCrm {
  return {
    tipo: "lista",
    titulo: "O que tem na loja nova",
    itens: [
      `O mesmo endereço: ${dominio(e.loja.url)}.`,
      "Conta sem senha: você entra com o e-mail e um código.",
      ...(e.daLoja.freteGratisAcima && !lembrete
        ? [`Frete grátis acima de ${emReais(e.daLoja.freteGratisAcima)}.`]
        : []),
      ...(e.daLoja.prazoDePostagem ? [`Postagem em ${e.daLoja.prazoDePostagem}.`] : []),
      "O pedido e o rastreio na sua conta.",
    ],
  }
}

export function emailDaEstreia(e: EstreiaDoEmail): EmailDoCrm | null {
  const comCupom = e.segmento === "lead" || e.segmento === "sumido"
  const cupom = comCupom ? e.cupom : null
  const vale = cupom ? `${dia(cupom.ate)}, ${hora(cupom.ate)}` : ""
  const primeira = e.segmento === "lead"
  const base = {
    para: e.para,
    nome: primeiroNome(e.nome),
    campanha: "estreia",
    porque: PORQUE_DA_ESTREIA,
    sair: e.sair,
    loja: e.loja,
    estilo: "oferta" as const,
  }
  const produtos: BlocoDoCrm[] = e.produtos.length
    ? [
        {
          tipo: "produtos",
          titulo: primeira ? "Os mais pedidos" : "O que você levou da última vez",
          produtos: e.produtos.slice(0, 3),
        },
      ]
    : []
  const blocoDoCupom: BlocoDoCrm[] = cupom
    ? [
        {
          tipo: "cupom",
          codigo: cupom.codigo,
          oque: `${cupom.porcento}% ${primeira ? "na primeira compra" : "na loja toda"}`,
          validade: `Só seu. Vale até ${vale}, uma vez.`,
        },
      ]
    : []
  const usarOCupom = cupom
    ? { texto: "Usar meu cupom", caminho: `/discount/${encodeURIComponent(cupom.codigo)}` }
    : null
  const conhecer = { texto: "Conhecer a loja nova", caminho: "/" }

  if (e.toque === "estreia-2d") {
    if (!cupom || !usarOCupom) return null
    return {
      ...base,
      assunto: `Seu cupom de ${cupom.porcento}% vence amanhã`,
      previa: `Vale até ${vale}.`,
      titulo: "O cupom vence amanhã",
      texto: `O seu cupom de ${cupom.porcento}% da loja nova vale até ${vale}. Depois disso, ele some.`,
      botao: usarOCupom,
      blocos: [...blocoDoCupom, ...produtos],
    }
  }

  switch (e.segmento) {
    case "repor": {
      const a = e.acabando
      const seu = a ? `${a.artigo === "a" ? "Sua" : "Seu"} ${a.curto}` : null
      return {
        ...base,
        estilo: "lembrete",
        porque: PORQUE_DO_LEMBRETE_DA_ESTREIA,
        assunto: seu ? `${seu} deve estar acabando` : "A FuckingBarba tem loja nova",
        previa: "E a FuckingBarba tem loja nova, no mesmo endereço.",
        titulo: "Hora de repor",
        texto:
          (a
            ? `Pelas nossas contas, ${a.artigo} ${a.curto} da sua última compra está no fim. `
            : "Pelas nossas contas, está na hora de repor. ") +
          "E a FuckingBarba tem loja nova, no mesmo endereço: quando for repor, é lá.",
        botao: a?.produto
          ? {
              texto: `Ver ${a.artigo} ${a.curto}`,
              caminho: `/produtos/${encodeURIComponent(a.produto.handle)}`,
            }
          : conhecer,
        blocos: [...produtos, oQueTem(e, true)],
      }
    }
    case "cliente":
      return {
        ...base,
        assunto: "A FuckingBarba tem loja nova",
        previa: "O mesmo endereço, com a conta sem senha e o rastreio do pedido.",
        titulo: "A loja nova chegou",
        texto:
          "A FuckingBarba mudou de casa: o endereço é o mesmo, a loja é nova. Quando for repor, é lá.",
        botao: conhecer,
        blocos: [oQueTem(e), ...produtos],
      }
    case "sumido":
      return {
        ...base,
        assunto: cupom
          ? `Loja nova, e ${cupom.porcento}% pra você voltar`
          : "A FuckingBarba tem loja nova",
        previa: cupom
          ? `O cupom é só seu e vale até ${vale}.`
          : "O mesmo endereço, com a conta sem senha e o rastreio do pedido.",
        titulo: "A loja nova chegou",
        texto:
          "Faz um tempo que você não passa aqui. A FuckingBarba tem loja nova, no mesmo endereço" +
          (cupom ? `, e um cupom de ${cupom.porcento}% pra você voltar pra rotina.` : "."),
        botao: usarOCupom ?? conhecer,
        blocos: [...blocoDoCupom, ...produtos, oQueTem(e)],
      }
    case "lead":
      return {
        ...base,
        assunto: cupom
          ? `Loja nova, e ${cupom.porcento}% na sua primeira compra`
          : "A FuckingBarba tem loja nova",
        previa: cupom
          ? `O cupom é só seu e vale até ${vale}.`
          : "Barba e cabelo levados a sério, no mesmo endereço.",
        titulo: "A loja nova chegou",
        texto:
          "A FuckingBarba tem loja nova, no mesmo endereço: barba e cabelo levados a sério, com " +
          "fórmulas de alta performance" +
          (cupom ? `. Pra sua primeira compra, um cupom de ${cupom.porcento}%.` : "."),
        botao: usarOCupom ?? conhecer,
        blocos: [...blocoDoCupom, ...produtos, oQueTem(e)],
      }
  }
}
