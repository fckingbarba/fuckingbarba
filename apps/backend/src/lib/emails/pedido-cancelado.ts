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
 *
 * E O SEGUNDO E-MAIL DE UM PEDIDO CANCELADO mora aqui também, no fim: o do
 * pagamento que chegou DEPOIS do cancelamento (`emailDePagamentoDevolvido`).
 * Os dois dividem o topo, a lista do pedido e o caminho de volta pra loja.
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
 * O caminho de volta do dinheiro, que muda com a forma: Pix cai na conta que
 * pagou; cartão volta pela fatura, e aí quem manda no prazo é o banco.
 */
export function voltaDoDinheiro({ valor, forma }: { valor: number; forma: "pix" | "cartao" }) {
  const reais = emReais(valor)
  return forma === "pix"
    ? `Os ${reais} do Pix voltam pra conta que pagou, na mesma chave. ` +
        "O Pagar.me devolve, e costuma cair em até um dia útil."
    : `Os ${reais} voltam pro mesmo cartão. O estorno já foi pedido; quem manda no prazo ` +
        "daí pra frente é o banco — pode aparecer nesta fatura ou na próxima."
}

/**
 * O QUE ACONTECE COM O DINHEIRO — a parte que a pessoa abre o e-mail pra ler.
 *
 * Sem cobrança, é uma frase só e ela resolve tudo. Com estorno, é o caminho
 * de volta (`voltaDoDinheiro`).
 */
export function oQueAconteceComODinheiro(c: CancelamentoDoEmail): string {
  if (!c.estorno) return "Nada foi cobrado de você — não há nada a pagar nem a receber."
  return voltaDoDinheiro(c.estorno)
}

/** Quando o dinheiro volta: o que fazer se ele não aparecer. */
const seDemorar = (numero: string) =>
  "Se passar desse prazo e o valor não tiver aparecido, responda este e-mail " +
  `com o número ${numero}: a gente corre atrás.`

/* ── as partes que os dois e-mails dividem ────────────────────────────────── */

/** O topo: o título, o número em destaque e a linha do que houve. */
function cabecalho(texto: string, numero: string, linha: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" style="text-align:center;">` +
    titulo(texto) +
    espaco(10) +
    paragrafo(
      `Número <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
        `padding:2px 7px;white-space:nowrap;">${esc(numero)}</span>`,
      { tamanho: 15 }
    ) +
    espaco(6) +
    paragrafo(esc(linha), { suave: true, tamanho: 14 }) +
    `</td></tr></table>`
  )
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

/** O que estava no pedido. Sem itens, nada — cartão vazio não. */
function cartaoDoPedido(itens: ItemDoEmail[], total: number): string {
  if (!itens.length) return ""
  return cartao(
    rotulo("O que estava no pedido") +
      espaco(4) +
      itens.map(linhaDoItem).join(divisor()) +
      espaco(10) +
      divisor() +
      espaco(14) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td>${paragrafo("Total", { suave: true, tamanho: 14 })}</td>` +
      `<td align="right" style="text-align:right;white-space:nowrap;">` +
      paragrafo(esc(emReais(total)), { tamanho: 16, peso: 800 }) +
      `</td></tr></table>`
  )
}

function pedidoEmTexto(itens: ItemDoEmail[], total: number): string[] {
  if (!itens.length) return []
  return [
    "",
    "O QUE ESTAVA NO PEDIDO",
    ...itens.map(
      (i) =>
        `- ${i.nome}${i.variante ? ` (${i.variante})` : ""}: ${i.quantidade} × ${emReais(i.precoUnitario)} = ${emReais(i.total)}`
    ),
    `Total: ${emReais(total)}`,
  ]
}

function botaoDaLoja(loja: string | null): string {
  return loja
    ? espaco(22) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td align="center">${botao({ texto: "Voltar pra loja", href: loja })}</td>` +
        `</tr></table>`
    : ""
}

function ajuda(numero: string, whatsapp: string | null): string {
  return whatsapp
    ? `Qualquer dúvida, chama no WhatsApp <a href="https://wa.me/${esc(whatsapp)}" target="_blank" ` +
        `style="color:${COR.tinta};font-weight:700;text-decoration:underline;white-space:nowrap;" class="fb-texto">` +
        `${esc(whatsappNaTela(whatsapp))}</a> com o número <b>${esc(numero)}</b>.`
    : `Qualquer dúvida, responda este e-mail com o número <b>${esc(numero)}</b>.`
}

const ajudaEmTexto = (numero: string, whatsapp: string | null) =>
  whatsapp
    ? `Qualquer dúvida, chama no WhatsApp ${whatsappNaTela(whatsapp)} com o número ${numero}.`
    : `Qualquer dúvida, responda este e-mail com o número ${numero}.`

function naMoldura(
  { assunto, previa, conteudo }: { assunto: string; previa: string; conteudo: string },
  numero: string,
  loja: string | null
): string {
  return moldura({
    assunto,
    previa,
    conteudo,
    rodape: `Você recebeu porque fez o pedido ${esc(numero)} na FuckingBarba.`,
    links: loja
      ? [
          { texto: "Loja", href: loja },
          { texto: "Instagram", href: INSTAGRAM },
        ]
      : [{ texto: "Instagram", href: INSTAGRAM }],
  })
}

/* ── o pedido cancelado ───────────────────────────────────────────────────── */

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
    cabecalho("Pedido cancelado", numero, porque) +
      espaco(22) +
      divisor() +
      espaco(20) +
      rotulo(c.estorno ? "O seu dinheiro" : "A cobrança") +
      espaco(10) +
      paragrafo(esc(dinheiro), { tamanho: 14 }) +
      (c.estorno
        ? espaco(12) + paragrafo(esc(seDemorar(numero)), { suave: true, tamanho: 13 })
        : ""),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que estava no pedido */
  const compra = cartaoDoPedido(c.itens, c.total)

  /* 3. como comprar de novo */
  const depois = cartao(
    rotulo("Quer fazer de novo?") +
      espaco(12) +
      paragrafo(
        c.motivo === "pix-vencido"
          ? "Os produtos voltaram pro estoque. É só refazer o pedido — um Pix novo nasce na hora."
          : "Os produtos voltaram pro estoque e continuam à venda.",
        { tamanho: 14 }
      ) +
      botaoDaLoja(loja) +
      espaco(20) +
      paragrafo(ajuda(numero, whatsapp), { suave: true, tamanho: 13 })
  )

  const html = naMoldura(
    { assunto, previa: dinheiro, conteudo: topo + compra + depois },
    numero,
    loja
  )

  const texto = [
    `FuckingBarba — pedido ${numero} cancelado`,
    "",
    porque,
    "",
    dinheiro,
    ...(c.estorno ? ["", seDemorar(numero)] : []),
    ...pedidoEmTexto(c.itens, c.total),
    "",
    c.motivo === "pix-vencido"
      ? "Os produtos voltaram pro estoque. É só refazer o pedido — um Pix novo nasce na hora."
      : "Os produtos voltaram pro estoque e continuam à venda.",
    ...(loja ? ["", `A loja: ${loja}`] : []),
    "",
    ajudaEmTexto(numero, whatsapp),
  ].join("\n")

  return { para: c.email, assunto, html, texto }
}

/* ── o pagamento que chegou depois do cancelamento ────────────────────────── */

/**
 * O PAGAMENTO QUE CHEGOU DEPOIS — o segundo e-mail de um pedido cancelado, e
 * só de alguns.
 *
 * Cancelar o pedido não mata o QR do Pix (o Pagar.me não cancela Pix
 * pendente), e quem estava com ele aberto ainda paga. O dinheiro entra num
 * pedido cancelado, e a conciliação devolve. Até 25/09, calada: o último
 * e-mail que a pessoa tinha recebido dizia "Nada foi cobrado de você", e aí
 * ela via o dinheiro sair da conta — e, um dia depois, voltar.
 *
 * O e-mail de antes não mentiu (quando saiu, não tinha sido cobrado nada), e
 * este não finge que ele não existiu: conta o que mudou depois dele.
 *
 * Quem manda, quando e quantas vezes (uma) é o `lib/avisar-devolucao.ts`.
 */
export type DevolucaoDoEmail = {
  id: string
  numero: number
  email: string
  itens: ItemDoEmail[]
  total: number
  /** O que entrou depois do cancelamento e está voltando. */
  devolvido: { valor: number; forma: "pix" | "cartao" }
}

/** O que houve, pra quem leu "nada foi cobrado" e depois viu o dinheiro sair. */
export function oQueHouveDepois(d: DevolucaoDoEmail): string {
  const pagou = d.devolvido.forma === "pix" ? "O Pix foi pago" : "O pagamento no cartão entrou"
  return (
    `Quando o pedido #${d.numero} foi cancelado, ele ainda não tinha sido pago — e foi isso ` +
    `que o e-mail do cancelamento disse. ${pagou} depois, e o pedido continua cancelado: ` +
    "o valor volta inteiro pra você."
  )
}

export function emailDePagamentoDevolvido({
  devolucao: d,
  whatsapp,
}: {
  devolucao: DevolucaoDoEmail
  /** Só dígitos, com DDI (5547999990000) — o das configurações da loja. */
  whatsapp: string | null
}): Email {
  const numero = `#${d.numero}`
  const noPix = d.devolvido.forma === "pix"
  const oQue = noPix ? "Pix" : "pagamento"
  const assunto = `Pedido ${numero}: devolvemos o seu ${oQue}`
  const linha = "O pagamento chegou depois do cancelamento."
  const houve = oQueHouveDepois(d)
  const dinheiro = voltaDoDinheiro(d.devolvido)
  const deNovo = noPix
    ? "Eles continuam à venda. É só refazer o pedido — um Pix novo nasce na hora."
    : "Eles continuam à venda. É só refazer o pedido."
  const loja = urlDaLoja()

  /* 1. o que houve depois do cancelamento, e o caminho do dinheiro */
  const topo = cartao(
    cabecalho(`Devolvemos o seu ${oQue}`, numero, linha) +
      espaco(22) +
      divisor() +
      espaco(20) +
      rotulo("O que aconteceu") +
      espaco(10) +
      paragrafo(esc(houve), { tamanho: 14 }) +
      espaco(20) +
      rotulo("O seu dinheiro") +
      espaco(10) +
      paragrafo(esc(dinheiro), { tamanho: 14 }) +
      espaco(12) +
      paragrafo(esc(seDemorar(numero)), { suave: true, tamanho: 13 }),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que estava no pedido */
  const compra = cartaoDoPedido(d.itens, d.total)

  /* 3. quem pagou queria os produtos: o caminho pra comprar de novo */
  const depois = cartao(
    rotulo("Ainda quer os produtos?") +
      espaco(12) +
      paragrafo(deNovo, { tamanho: 14 }) +
      botaoDaLoja(loja) +
      espaco(20) +
      paragrafo(ajuda(numero, whatsapp), { suave: true, tamanho: 13 })
  )

  const html = naMoldura(
    { assunto, previa: dinheiro, conteudo: topo + compra + depois },
    numero,
    loja
  )

  const texto = [
    `FuckingBarba — pedido ${numero}: devolvemos o seu ${oQue}`,
    "",
    linha,
    "",
    houve,
    "",
    dinheiro,
    "",
    seDemorar(numero),
    ...pedidoEmTexto(d.itens, d.total),
    "",
    `Ainda quer os produtos? ${deNovo}`,
    ...(loja ? ["", `A loja: ${loja}`] : []),
    "",
    ajudaEmTexto(numero, whatsapp),
  ].join("\n")

  return { para: d.email, assunto, html, texto }
}
