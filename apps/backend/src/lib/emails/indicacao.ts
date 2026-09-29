import { dia, hora } from "../painel/formato"
import { primeiroNome } from "./boas-vindas"
import type { EmailDoCrm } from "./crm"

/**
 * OS E-MAILS DO INDIQUE UM BROTHER (entrega 0215, a etapa 4 do "Ciclo da
 * Barba" — `lib/crm/indicacao.ts`):
 *
 *   - o CONVITE, na jornada do resultado (10 dias depois que o pedido chega),
 *     pra quem está gostando: o link, o "Mandar no WhatsApp" e o que cada um
 *     ganha;
 *   - o LEMBRETE, 30 dias depois do convite, se nenhum brother comprou;
 *   - o PRÊMIO, quando um brother paga a 1ª compra com o link: o cupom de
 *     quem indicou. O brother não aparece: nem o nome, nem o e-mail.
 *
 * Os três falam de desconto: são OFERTA (o "cancelar inscrição" no
 * cabeçalho; Promoções é o lugar deles). Sem emoji, e sem as frases de
 * propaganda que os lembretes evitam.
 *
 * Código puro, com testes.
 */

export type IndiqueDoEmail = {
  /** O código do link (`BROTHER-7KQ2MX`): é o cupom do brother. */
  codigo: string
  /** O link que o brother abre: a loja, com o cupom já guardado (`/discount/BROTHER-…`). */
  link: string
  /** O "Mandar no WhatsApp": a conversa com a mensagem e o link prontos (`wa.me`). */
  whatsapp: string
  /** Quanto o brother ganha na 1ª compra, em %. */
  porcentoDoAmigo: number
  /** Quanto quem indicou ganha quando o brother paga, em %. */
  porcentoDoPremio: number
}

export type ToqueDoIndique = "jornada-indique" | "jornada-indique-30d"

export function emailDoIndique(i: {
  toque: ToqueDoIndique
  para: string
  /** O nome como veio (a conta, o pedido). O e-mail usa o primeiro. */
  nome: string | null
  indique: IndiqueDoEmail
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}): EmailDoCrm {
  const { codigo, link, whatsapp, porcentoDoAmigo: amigo, porcentoDoPremio: premio } = i.indique
  const base = {
    para: i.para,
    nome: primeiroNome(i.nome),
    campanha: "indicacao",
    sair: i.sair,
    loja: i.loja,
    estilo: "oferta" as const,
    blocos: [
      {
        tipo: "cupom" as const,
        codigo,
        oque: `${amigo}% na 1ª compra de quem usar o seu link`,
        validade: "Vale pra cada brother que você indicar.",
      },
      {
        tipo: "escolhas" as const,
        itens: [
          { texto: "Mandar no WhatsApp", href: whatsapp },
          { texto: "Ver na minha conta", href: `${i.loja.url}/conta` },
        ],
      },
      { tipo: "texto" as const, texto: `Ou copie o seu link: ${link}` },
    ],
  }
  if (i.toque === "jornada-indique")
    return {
      ...base,
      assunto: `Indique um brother: ${amigo}% pra ele, ${premio}% pra você`,
      previa: "Ele ganha na primeira compra; você, quando ele comprar.",
      titulo: "Indique um brother",
      texto:
        `Tá curtindo a FuckingBarba? Manda o seu link pra um brother: ele ganha ${amigo}% na ` +
        `primeira compra, e quando ele comprar, você ganha ${premio}% na próxima.`,
    }
  return {
    ...base,
    assunto: `Seu link continua valendo ${premio}% pra você`,
    previa: "Nenhum brother usou o seu link até agora.",
    titulo: "Seu link continua valendo",
    texto:
      `Nenhum brother usou o seu link até agora. Ele ganha ${amigo}% na primeira compra, e ` +
      `você ganha ${premio}% na próxima quando ele comprar.`,
  }
}

/** O PRÊMIO: o cupom de quem indicou, quando o brother pagou. */
export function emailDoPremio(p: {
  para: string
  nome: string | null
  cupom: { codigo: string; porcento: number; ate: Date }
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
}): EmailDoCrm {
  const vale = `${dia(p.cupom.ate)}, ${hora(p.cupom.ate)}`
  return {
    para: p.para,
    nome: primeiroNome(p.nome),
    campanha: "indicacao",
    assunto: `Seu brother comprou. Seus ${p.cupom.porcento}% chegaram`,
    previa: `O cupom é só seu e vale até ${vale}.`,
    titulo: "Valeu pela indicação",
    texto:
      `Um brother fez a primeira compra com o seu link. Como combinado, você ganhou ` +
      `${p.cupom.porcento}% na próxima compra.`,
    botao: {
      texto: "Usar meu cupom",
      caminho: `/discount/${encodeURIComponent(p.cupom.codigo)}`,
    },
    blocos: [
      {
        tipo: "cupom",
        codigo: p.cupom.codigo,
        oque: `${p.cupom.porcento}% na próxima compra`,
        validade: `Só seu. Vale até ${vale}, uma vez.`,
      },
    ],
    sair: p.sair,
    loja: p.loja,
    estilo: "oferta",
  }
}
