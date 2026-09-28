import type { Email } from "../email"
import { urlDoPainel } from "./convite"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O PEDIDO CANCELADO QUE FICOU NO PAINEL DA FRENET — pra equipe (quem
 * despacha e o dono), uma vez por pedido. Quem manda é o `tirarDoParceiro`
 * (`lib/envios/registro.ts`), na primeira vez que a Frenet não deixa tirar.
 *
 * É o aviso que chega antes da etiqueta: quem despacha trabalha no painel da
 * Frenet, e o pedido cancelado continua lá como qualquer outro.
 *
 * Nada de dado do cliente: o número do pedido e o nome dele no painel da
 * Frenet (FB-…) bastam pra achar.
 */

export type CanceladoNoPainel = {
  /** O id do pedido no Medusa — é o link do painel da loja. */
  pedidoId: string
  numero: number
  /** Como o pedido se chama no painel da Frenet ("FB-1042"). */
  referencia: string
  /** O que a Frenet respondeu. */
  motivo: string
  /** Por quantos dias depois do cancelamento a loja segue tentando sozinha. */
  dias: number
}

export function emailDoCanceladoNaFrenet(para: string, a: CanceladoNoPainel): Email {
  const assunto = `O pedido #${a.numero} foi cancelado e continua na Frenet`
  const oQueHouve =
    `O pedido #${a.numero} foi cancelado, mas a loja não conseguiu tirar o ${a.referencia} do ` +
    `painel da Frenet: ${a.motivo.trim().replace(/[.\s]+$/, "")}.`
  const sozinha =
    `A loja segue tentando tirar sozinha por ${a.dias} dias depois do cancelamento — e, se ` +
    "conseguir, não manda outro e-mail."
  const oQueFazer =
    `Não gere a etiqueta do ${a.referencia}. Se já gerou, cancele a etiqueta no painel da ` +
    "Frenet, pra o pacote não sair."
  const painel = urlDoPainel()
  const link = painel ? `${painel}/pedidos/${encodeURIComponent(a.pedidoId)}` : null

  const texto = [
    assunto,
    "",
    oQueHouve,
    "",
    sozinha,
    "",
    oQueFazer,
    ...(link ? ["", `O pedido no painel: ${link}`] : []),
  ].join("\n")

  const conteudo = cartao(
    titulo("O cancelado continua na Frenet") +
      espaco(12) +
      paragrafo(esc(oQueHouve)) +
      espaco(14) +
      paragrafo(esc(sozinha), { suave: true }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(oQueFazer), { peso: 700 }) +
      (link ? espaco(22) + botao({ texto: "Abrir o pedido no painel", href: link }) : "")
  )

  const html = moldura({
    assunto,
    previa: `Não gere a etiqueta do ${a.referencia}.`,
    conteudo,
    rodape:
      "Aviso automático do registro de pedidos na Frenet, pra quem despacha e pro dono da loja.",
  })

  return { para, assunto, html, texto }
}
