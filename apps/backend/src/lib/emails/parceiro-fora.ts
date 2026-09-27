import type { Email } from "../email"
import type { Forma } from "../pagamento/estado"
import { DISJUNTOR } from "../pagamento/disjuntor"
import { duracao, hora, minutosEntre } from "../painel/formato"
import { urlDoPainel } from "./convite"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O AVISO DO DISJUNTOR — pra equipe (o dono), quando um parceiro de
 * pagamento para de atender (três tentativas seguidas sem resposta, ver
 * `lib/pagamento/disjuntor.ts`) e quando ele volta.
 *
 * Quem manda é o `lib/pagamento/aviso.ts`, no máximo um de cada por hora e
 * por parceiro. O texto depende de quem mais está ligado na loja: com o
 * outro parceiro de pé, o Pix sai por ele e ninguém deixa de pagar no Pix;
 * sem ele, é provável que ninguém consiga pagar. Nada de dado de cliente.
 */

export type ParceiroNoAviso = { nome: string; formas: readonly Forma[] }

export type AvisoDoParceiro = {
  parceiro: ParceiroNoAviso
  /** É a reserva: com todo mundo bem, o Pix nem passa por ele. */
  reserva: boolean
  tipo: "caiu" | "voltou"
  /** Caiu: a primeira das falhas seguidas. Voltou: quando a queda começou. */
  desde: Date
  /** Os OUTROS parceiros ligados na loja, e se estão em queda agora. */
  outros: (ParceiroNoAviso & { emQueda: boolean })[]
}

export function emailDoParceiro(para: string, a: AvisoDoParceiro, agora = new Date()): Email {
  const { assunto, oQueHouve, oQueALojaFez, oQueFazer, previa } =
    a.tipo === "caiu" ? caiu(a) : voltou(a, agora)
  const painel = urlDoPainel()
  const link = painel ? `${painel}/observabilidade` : null

  const texto = [
    assunto,
    "",
    oQueHouve,
    "",
    oQueALojaFez,
    "",
    oQueFazer,
    ...(link ? ["", `Na Observabilidade do painel: ${link}`] : []),
  ].join("\n")

  const conteudo = cartao(
    titulo(a.tipo === "caiu" ? `O ${a.parceiro.nome} parou` : `O ${a.parceiro.nome} voltou`) +
      espaco(12) +
      paragrafo(esc(oQueHouve)) +
      espaco(14) +
      paragrafo(esc(oQueALojaFez), { suave: true }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(oQueFazer), { peso: 700 }) +
      (link ? espaco(22) + botao({ texto: "Ver na Observabilidade", href: link }) : "")
  )

  const html = moldura({
    assunto,
    previa,
    conteudo,
    rodape: "Aviso automático dos pagamentos da loja, pra quem cuida dela.",
  })

  return { para, assunto, html, texto }
}

type Textos = {
  assunto: string
  oQueHouve: string
  oQueALojaFez: string
  oQueFazer: string
  previa: string
}

const PIX_E_CARTAO = (p: ParceiroNoAviso) => p.formas.includes("cartao")

function caiu(a: AvisoDoParceiro): Textos {
  const nome = a.parceiro.nome
  const oQueHouve =
    `Desde as ${hora(a.desde)}, as últimas ${DISJUNTOR.falhas} tentativas de pagamento pelo ` +
    `${nome} ficaram sem resposta — é ele fora do ar, ou com problema.`
  const volta = `A cada ${DISJUNTOR.minutos} minutos a loja tenta o ${nome} de novo, sozinha, e avisa quando ele voltar.`
  const dePe = a.outros.filter((o) => !o.emQueda)
  const reserva = dePe.find((o) => o.formas.includes("pix"))
  const caidos = a.outros.filter((o) => o.emQueda)

  // O que caiu é a reserva, e quem cobra de verdade segue de pé.
  if (a.reserva && dePe.length) {
    const principal = dePe[0]
    return {
      assunto: `O ${nome} parou de responder (a reserva do Pix)`,
      previa: "Nada muda pra quem compra.",
      oQueHouve,
      oQueALojaFez:
        `Nada muda pra quem compra: o ${principal.nome} segue cobrando. Só que, se ele cair ` +
        `agora, não há reserva. ${volta}`,
      oQueFazer:
        `Se durar, confira no ${nome} se a chave da loja continua valendo — uma chave apagada ou ` +
        "trocada também aparece assim.",
    }
  }

  if (reserva) {
    const cartaoFora =
      PIX_E_CARTAO(a.parceiro) && !a.outros.some((o) => PIX_E_CARTAO(o) && !o.emQueda)
    return {
      assunto: `O ${nome} parou de responder: o Pix está saindo pelo ${reserva.nome}`,
      previa: `O Pix segue funcionando pelo ${reserva.nome}.`,
      oQueHouve,
      oQueALojaFez:
        `A loja tirou o ${nome} do caminho: o Pix está saindo pelo ${reserva.nome}` +
        (cartaoFora
          ? ", e o cartão fica fora da tela até ele voltar — quem ia pagar no cartão vê que o Pix funciona. "
          : ". ") +
        volta,
      oQueFazer: `Não precisa fazer nada agora. Se durar mais de uma hora, vale chamar o suporte do ${nome}.`,
    }
  }

  if (caidos.length) {
    const outros = caidos.map((o) => o.nome).join(" e ")
    return {
      assunto: "Os parceiros de pagamento pararam de responder",
      previa: "É provável que ninguém consiga pagar agora.",
      oQueHouve: `${oQueHouve} O ${outros} também não está respondendo.`,
      oQueALojaFez:
        "Sem nenhum parceiro de pé, a loja segue tentando a cada compra — mas é provável que " +
        `ninguém consiga pagar agora. ${volta}`,
      oQueFazer:
        "Vale chamar o suporte dos parceiros. Enquanto isso, quem chamar no WhatsApp pode fechar o " +
        "pedido por lá.",
    }
  }

  // Um parceiro só na loja (a reserva desligada): nada pra onde mandar ninguém.
  return {
    assunto: `O ${nome} parou de responder`,
    previa: "É provável que ninguém consiga pagar agora.",
    oQueHouve,
    oQueALojaFez:
      `A loja não tem outro parceiro ligado, então segue tentando o ${nome} a cada compra — e ` +
      `é provável que ninguém consiga pagar enquanto ele não voltar. ${volta}`,
    oQueFazer: `Vale chamar o suporte do ${nome}. Enquanto isso, quem chamar no WhatsApp pode fechar o pedido por lá.`,
  }
}

function voltou(a: AvisoDoParceiro, agora: Date): Textos {
  const nome = a.parceiro.nome
  const fora = duracao(Math.max(1, minutosEntre(a.desde, agora)))
  return {
    assunto: `O ${nome} voltou`,
    previa: `Depois de ${fora} fora.`,
    oQueHouve: `O ${nome} voltou a responder às ${hora(agora)}, depois de ${fora} fora (desde as ${hora(a.desde)}).`,
    oQueALojaFez: PIX_E_CARTAO(a.parceiro)
      ? `A loja voltou a cobrar por ele: o Pix sai pelo ${nome} de novo, e o cartão voltou pra tela.`
      : `O Pix reserva, pelo ${nome}, está de pé de novo.`,
    oQueFazer: "Não precisa fazer nada.",
  }
}
