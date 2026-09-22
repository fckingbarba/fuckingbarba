import type { Email } from "../email"
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
  urlDaLoja,
} from "./moldura"
import type { ItemDoEmail } from "./pedido-confirmado"
import { whatsappNaTela } from "./pedido-confirmado"

/**
 * O E-MAIL DE PEDIDO CANCELADO — e, quando houve cobrança, o aviso do estorno.
 *
 * Só o desenho. Quem manda, quando e quantas vezes (uma) é o
 * `lib/avisar-cancelamento.ts`.
 *
 * ┌─ POR QUE ELE EXISTE ───────────────────────────────────────────────────┐
 * │ O primeiro Pix pago de verdade foi cancelado e estornado, e o cliente  │
 * │ não recebeu uma palavra: viu o dinheiro sair da conta, viu voltar, sem │
 * │ ninguém explicar. O e-mail de confirmação existia desde o começo; este │
 * │ nunca tinha sido escrito. É o #10.                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ONDE A MESMA COISA JÁ EXISTE NA LOJA, O TEXTO É O DE LÁ: a linha do porquê
 * é a do `porQueCancelou` da conta (`apps/loja/src/components/conta/pedidos.tsx`).
 * Quem mudar uma frase lá muda aqui também.
 *
 * O PRAZO DO ESTORNO É O DO BANCO, e a loja não manda nele: o texto diz o que
 * costuma acontecer, sem prometer dia. Prometer "cai amanhã" e não cair é
 * pior do que não ter dito nada.
 */

export type MotivoDoCancelamento = "estornado" | "pix-vencido" | "sem-cobranca"

export type CancelamentoDoEmail = {
  id: string
  numero: number
  email: string
  itens: ItemDoEmail[]
  total: number
  motivo: MotivoDoCancelamento
  /** O que está voltando. Só no `estornado`; nos outros, `null`. */
  estorno: { valor: number; forma: "pix" | "cartao" } | null
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"

/** A linha do porquê, palavra por palavra a do `porQueCancelou` da conta. */
export function porQueCancelou(motivo: MotivoDoCancelamento): string {
  if (motivo === "estornado") return "Cancelado, com o pagamento estornado."
  if (motivo === "pix-vencido") return "O Pix venceu antes do pagamento."
  return "Cancelado antes do pagamento."
}

/**
 * O QUE ACONTECE COM O DINHEIRO — a parte que a pessoa abre o e-mail pra ler.
 *
 * Sem cobrança, é uma frase só e ela resolve tudo. Com estorno, o caminho de
 * volta muda com a forma: Pix cai na conta que pagou; cartão volta pela
 * fatura, e aí quem manda no prazo é o banco.
 */
export function oQueAconteceComODinheiro(c: CancelamentoDoEmail): string {
  if (!c.estorno) return "Nada foi cobrado de você — não há nada a pagar nem a receber."
  const valor = emReais(c.estorno.valor)
  return c.estorno.forma === "pix"
    ? `Os ${valor} do Pix voltam pra conta que pagou, na mesma chave. ` +
        "O Pagar.me devolve, e costuma cair em até um dia útil."
    : `Os ${valor} voltam pro mesmo cartão. O estorno já foi pedido; quem manda no prazo ` +
        "daí pra frente é o banco — pode aparecer nesta fatura ou na próxima."
}

function linhaDoItem(item: ItemDoEmail): string {
  const detalhe = [item.variante, `${item.quantidade} × ${emReais(item.precoUnitario)}`]
    .filter(Boolean)
    .map(esc)
    .join(" · ")
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="top" style="padding:10px 12px 10px 0;">` +
    paragrafo(esc(item.nome), { tamanho: 14, peso: 700 }) +
    paragrafo(detalhe, { suave: true, tamanho: 13 }) +
    `</td>` +
    `<td valign="top" align="right" style="padding:10px 0;white-space:nowrap;text-align:right;">` +
    paragrafo(esc(emReais(item.total)), { tamanho: 14, peso: 800 }) +
    `</td>` +
    `</tr></table>`
  )
}

export function emailDePedidoCancelado({
  cancelamento: c,
  whatsapp,
}: {
  cancelamento: CancelamentoDoEmail
  /** Só dígitos, com DDI (5547999990000) — o das configurações da loja. */
  whatsapp: string | null
}): Email {
  const numero = `#${c.numero}`
  const assunto = c.estorno
    ? `Pedido ${numero} cancelado e estornado`
    : `Pedido ${numero} cancelado`
  const porque = porQueCancelou(c.motivo)
  const dinheiro = oQueAconteceComODinheiro(c)
  const loja = urlDaLoja()

  /* 1. o que houve, e o que acontece com o dinheiro */
  const topo = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      titulo("Pedido cancelado") +
      espaco(10) +
      paragrafo(
        `Número <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
          `padding:2px 7px;white-space:nowrap;">${esc(numero)}</span>`,
        { tamanho: 15 }
      ) +
      espaco(6) +
      paragrafo(esc(porque), { suave: true, tamanho: 14 }) +
      `</td></tr></table>` +
      espaco(22) +
      divisor() +
      espaco(20) +
      rotulo(c.estorno ? "O seu dinheiro" : "A cobrança") +
      espaco(10) +
      paragrafo(esc(dinheiro), { tamanho: 14 }) +
      (c.estorno
        ? espaco(12) +
          paragrafo(
            "Se passar desse prazo e o valor não tiver aparecido, responda este e-mail " +
              `com o número ${esc(numero)}: a gente corre atrás.`,
            { suave: true, tamanho: 13 }
          )
        : ""),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que estava no pedido */
  const compra = c.itens.length
    ? cartao(
        rotulo("O que estava no pedido") +
          espaco(4) +
          c.itens.map(linhaDoItem).join(divisor()) +
          espaco(10) +
          divisor() +
          espaco(14) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td>${paragrafo("Total", { suave: true, tamanho: 14 })}</td>` +
          `<td align="right" style="text-align:right;white-space:nowrap;">` +
          paragrafo(esc(emReais(c.total)), { tamanho: 16, peso: 800 }) +
          `</td></tr></table>`
      )
    : ""

  /* 3. como comprar de novo */
  const ajuda = whatsapp
    ? `Qualquer dúvida, chama no WhatsApp <a href="https://wa.me/${esc(whatsapp)}" target="_blank" ` +
      `style="color:${COR.tinta};font-weight:700;text-decoration:underline;white-space:nowrap;" class="fb-texto">` +
      `${esc(whatsappNaTela(whatsapp))}</a> com o número <b>${esc(numero)}</b>.`
    : `Qualquer dúvida, responda este e-mail com o número <b>${esc(numero)}</b>.`

  const depois = cartao(
    rotulo("Quer fazer de novo?") +
      espaco(12) +
      paragrafo(
        c.motivo === "pix-vencido"
          ? "Os produtos voltaram pro estoque. É só refazer o pedido — um Pix novo nasce na hora."
          : "Os produtos voltaram pro estoque e continuam à venda.",
        { tamanho: 14 }
      ) +
      (loja
        ? espaco(22) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center">${botao({ texto: "Voltar pra loja", href: loja })}</td>` +
          `</tr></table>`
        : "") +
      espaco(20) +
      paragrafo(ajuda, { suave: true, tamanho: 13 })
  )

  const html = moldura({
    assunto,
    previa: dinheiro,
    conteudo: topo + compra + depois,
    rodape: `Você recebeu porque fez o pedido ${esc(numero)} na FuckingBarba.`,
    links: loja
      ? [
          { texto: "Loja", href: loja },
          { texto: "Instagram", href: INSTAGRAM },
        ]
      : [{ texto: "Instagram", href: INSTAGRAM }],
  })

  const texto = [
    `FuckingBarba — pedido ${numero} cancelado`,
    "",
    porque,
    "",
    dinheiro,
    ...(c.estorno
      ? [
          "",
          `Se passar desse prazo e o valor não tiver aparecido, responda este e-mail com o número ${numero}: a gente corre atrás.`,
        ]
      : []),
    ...(c.itens.length
      ? [
          "",
          "O QUE ESTAVA NO PEDIDO",
          ...c.itens.map(
            (i) =>
              `- ${i.nome}${i.variante ? ` (${i.variante})` : ""}: ${i.quantidade} × ${emReais(i.precoUnitario)} = ${emReais(i.total)}`
          ),
          `Total: ${emReais(c.total)}`,
        ]
      : []),
    "",
    c.motivo === "pix-vencido"
      ? "Os produtos voltaram pro estoque. É só refazer o pedido — um Pix novo nasce na hora."
      : "Os produtos voltaram pro estoque e continuam à venda.",
    ...(loja ? ["", `A loja: ${loja}`] : []),
    "",
    whatsapp
      ? `Qualquer dúvida, chama no WhatsApp ${whatsappNaTela(whatsapp)} com o número ${numero}.`
      : `Qualquer dúvida, responda este e-mail com o número ${numero}.`,
  ].join("\n")

  return { para: c.email, assunto, html, texto }
}
