import type { Email } from "../email"
import { urlDoPainel } from "./convite"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O ATENDENTE CHAMOU A EQUIPE — pra operação e pro dono (a tabela de
 * Configurações → E-mails), quando o atendente do WhatsApp passa uma
 * conversa pra uma pessoa: troca, reclamação, pedido de falar com alguém,
 * ou a IA fora três vezes seguidas.
 *
 * Quem manda é `lib/whatsapp/aviso.ts`, um por passagem. Vai o primeiro
 * nome, o motivo (na frase do atendente) e a última mensagem da pessoa,
 * curta — o resto está na conversa, no painel.
 */
export function emailDoWhatsappPraEquipe(
  para: string,
  p: { quem: string; motivo: string; ultima: string | null; conversa: string }
): Email {
  const assunto = `WhatsApp: ${p.quem} precisa de alguém da equipe`
  const painel = urlDoPainel()
  const link = painel ? `${painel}/whatsapp/${p.conversa}` : null
  const oQueHouve = `O atendente passou a conversa pra equipe: ${p.motivo}.`
  const oQueFazer =
    "Responda pelo painel: sai pelo WhatsApp da loja. Enquanto a equipe cuida, o atendente fica quieto nessa conversa (volta sozinho se ninguém responder em 24 horas)."

  const texto = [
    assunto,
    "",
    oQueHouve,
    ...(p.ultima ? ["", `A última mensagem: "${p.ultima}"`] : []),
    "",
    oQueFazer,
    ...(link ? ["", `A conversa no painel: ${link}`] : []),
  ].join("\n")

  const conteudo = cartao(
    titulo(`${p.quem} precisa de alguém`) +
      espaco(12) +
      paragrafo(esc(oQueHouve)) +
      (p.ultima ? espaco(12) + paragrafo(esc(`"${p.ultima}"`), { suave: true }) : "") +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(oQueFazer), { peso: 700 }) +
      (link ? espaco(22) + botao({ texto: "Abrir a conversa", href: link }) : "")
  )

  const html = moldura({
    assunto,
    previa: oQueHouve,
    conteudo,
    rodape: "Aviso automático do WhatsApp da loja, pra quem cuida do atendimento.",
  })

  return { para, assunto, html, texto }
}
