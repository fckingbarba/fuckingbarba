import type { Email } from "../email"
import { urlDoPainel } from "./convite"
import {
  botao,
  cartao,
  COR,
  divisor,
  emReais,
  esc,
  espaco,
  moldura,
  paragrafo,
  rotulo,
  titulo,
} from "./moldura"
import { linhaDoItem, rotuloDaEntrega, totais, type ItemDoEmail } from "./pedido-confirmado"

/**
 * O AVISO DE VENDA NOVA — pro dono da loja, quando o pagamento de um pedido
 * entra. Só o desenho: quem manda, quando e quantas vezes (uma por pedido) é
 * o `lib/avisar-venda.ts`.
 *
 * NADA DE DADO DO CLIENTE, como nos outros avisos da equipe (o do estorno, os
 * do ERP): nem nome, nem e-mail, nem endereço, nem o final do cartão — a
 * `VendaDoAviso` nem tem onde pôr. O número, o valor e o que foi vendido
 * dizem a venda; o resto está no pedido, no painel, atrás do login. E-mail
 * interno é encaminhado, fica em caixa compartilhada, vai pro celular.
 *
 * Os itens e os totais são os blocos do "Pedido confirmado"
 * (`pedido-confirmado.ts`): o dono lê a mesma conta que o cliente leu.
 */

export type VendaDoAviso = {
  /** O id do pedido no Medusa — é o link do painel. */
  id: string
  numero: number
  itens: ItemDoEmail[]
  subtotal: number
  desconto: number
  frete: number
  total: number
  /** O nome do frete no Medusa: "Entrega econômica", "Entrega expressa". */
  formaDeEntrega: string
  pagamento: { forma: "pix" } | { forma: "cartao"; bandeira: string; parcelas: number }
  /** Quando o pagamento entrou. O aviso que sai atrasado (pela varredura) diz a hora certa. */
  pagoEm: Date
  /** Os cupons do pedido — a oferta do checkout (`BUMP-…`) fica de fora. */
  cupons: string[]
}

const FUSO = "America/Sao_Paulo"

/** "14:32 de 26/09", no horário de Brasília. */
export function horaDoPagamento(d: Date): string {
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" })
  return `${hora} de ${dia}`
}

/**
 * "Pix pago às 14:32 de 26/09." · "Cartão Visa em 3x, aprovado às 14:32 de
 * 26/09." Sem a bandeira (a sessão não guardou), a frase encolhe.
 */
export function fraseDaVenda(v: Pick<VendaDoAviso, "pagamento" | "pagoEm">): string {
  const quando = horaDoPagamento(v.pagoEm)
  if (v.pagamento.forma === "pix") return `Pix pago às ${quando}.`
  const cartao = ["Cartão", v.pagamento.bandeira].filter(Boolean).join(" ")
  return v.pagamento.parcelas > 1
    ? `${cartao} em ${v.pagamento.parcelas}x, aprovado às ${quando}.`
    : `${cartao} aprovado às ${quando}.`
}

/**
 * O pedido no painel (`DASHBOARD_URL`), onde o dono trabalha — ou no admin do
 * Medusa (`MEDUSA_BACKEND_URL`) sem ele. Sem os dois, o aviso sai sem botão.
 */
export function linkDoPedido(id: string): { texto: string; href: string } | null {
  const painel = urlDoPainel()
  if (painel) {
    return {
      texto: "Abrir o pedido no painel",
      href: `${painel}/pedidos/${encodeURIComponent(id)}`,
    }
  }
  const admin = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\//.test(admin)
    ? { texto: "Abrir o pedido no admin", href: `${admin}/app/orders/${encodeURIComponent(id)}` }
    : null
}

const itensEmFrase = (itens: ItemDoEmail[]) => {
  const n = itens.reduce((soma, i) => soma + i.quantidade, 0)
  return `${n} ${n === 1 ? "item" : "itens"}`
}

export function emailDeVendaNova(para: string, v: VendaDoAviso): Email {
  const numero = `#${v.numero}`
  const valor = emReais(v.total)
  const forma = v.pagamento.forma === "pix" ? "Pix" : "cartão"
  const assunto = `Venda nova: pedido ${numero}, ${valor} no ${forma}`
  const frase = fraseDaVenda(v)
  const link = linkDoPedido(v.id)
  const cupom = v.cupons.length
    ? `${v.cupons.length > 1 ? "Cupons" : "Cupom"}: ${v.cupons.join(", ")}`
    : null

  /* 1. a venda: número, valor, quando e como foi paga */
  const topo = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      titulo("Venda nova") +
      espaco(10) +
      paragrafo(
        `Pedido <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
          `padding:2px 7px;white-space:nowrap;">${esc(numero)}</span>`,
        { tamanho: 15 }
      ) +
      espaco(12) +
      paragrafo(esc(valor), { tamanho: 30, peso: 800 }) +
      espaco(6) +
      paragrafo(esc(frase), { suave: true, tamanho: 14 }) +
      `</td></tr></table>` +
      (link
        ? espaco(24) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center">${botao(link)}</td></tr></table>`
        : ""),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que foi vendido, e a conta */
  const vendido = cartao(
    rotulo("O que foi vendido") +
      espaco(4) +
      v.itens.map(linhaDoItem).join(divisor()) +
      espaco(6) +
      divisor() +
      espaco(12) +
      totais(v) +
      (cupom ? espaco(14) + paragrafo(esc(cupom), { suave: true, tamanho: 13 }) : "")
  )

  const html = moldura({
    assunto,
    previa: `${frase} ${itensEmFrase(v.itens)}.`,
    conteudo: topo + vendido,
    rodape:
      "Aviso automático de cada venda paga, pro dono da loja. Quem recebe está no painel, em " +
      `<span style="white-space:nowrap;">Configurações → E-mails</span>.`,
  })

  const texto = [
    `Venda nova — pedido ${numero}`,
    "",
    valor,
    frase,
    "",
    "O QUE FOI VENDIDO",
    ...v.itens.map(
      (i) =>
        `- ${i.nome}${i.variante ? ` (${i.variante})` : ""}: ${i.quantidade} × ${emReais(i.precoUnitario)} = ${emReais(i.total)}`
    ),
    "",
    `Produtos: ${emReais(v.subtotal)}`,
    ...(v.desconto > 0 ? [`Desconto: −${emReais(v.desconto)}`] : []),
    `${rotuloDaEntrega(v.formaDeEntrega)}: ${v.frete === 0 ? "Grátis" : emReais(v.frete)}`,
    `Total: ${valor}`,
    ...(cupom ? [cupom] : []),
    ...(link ? ["", `${link.texto}: ${link.href}`] : []),
  ].join("\n")

  return { para, assunto, html, texto }
}
