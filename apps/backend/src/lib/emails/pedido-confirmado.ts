import type { Email } from "../email"
import {
  botao,
  cartao,
  COR,
  divisor,
  emReais,
  esc,
  espaco,
  FONTE,
  moldura,
  paragrafo,
  rotulo,
  titulo,
  urlDaLoja,
  vazio,
} from "./moldura"

/**
 * O E-MAIL DE PEDIDO CONFIRMADO — o que sai quando o pagamento cai.
 *
 * AINDA NÃO SAI: é o desenho, pronto pra quando o envio for ligado no
 * `subscribers/pagamento-capturado.ts` (a fase 5, ou antes). Quem ligar
 * monta o `PedidoDoEmail` a partir do pedido do Medusa — o molde é o
 * `lerPedido` da loja (`apps/loja/src/lib/pedido.ts`), campo por campo — e
 * pega o WhatsApp nas configurações da loja.
 *
 * O "ACOMPANHAR PEDIDO" aponta pro `/conta/pedidos/<id>`, que nasce na parte
 * 2 da Minha conta. Ligar este e-mail antes dela é mandar gente pra um 404.
 *
 * ONDE A MESMA COISA JÁ EXISTE NA LOJA, O TEXTO É O DE LÁ: o título, a frase
 * do pagamento, os rótulos dos totais e o "E agora?" são os da tela de
 * obrigado (`checkout/obrigado/[id]/page.tsx`); os quatro passos da trilha
 * são os do protótipo da conta. Quem mudar uma frase lá muda aqui também.
 */

export type ItemDoEmail = {
  nome: string
  /** "Amadeirado", ou null quando o produto só tem uma. */
  variante: string | null
  /** URL absoluta da foto (a do Medusa, no Supabase), ou null. */
  imagem: string | null
  quantidade: number
  precoUnitario: number
  total: number
}

export type PagamentoDoEmail =
  { forma: "pix" } | { forma: "cartao"; bandeira: string; final: string; parcelas: number }

export type PedidoDoEmail = {
  id: string
  numero: number
  email: string
  itens: ItemDoEmail[]
  subtotal: number
  desconto: number
  frete: number
  total: number
  /** O nome do frete no Medusa: "Entrega econômica", "Entrega expressa". */
  formaDeEntrega: string
  entrega: {
    nome: string
    linha1: string
    linha2: string
    cidade: string
    uf: string
    /** Já com máscara: 89036-370. */
    cep: string
  } | null
  pagamento: PagamentoDoEmail
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"

/** A frase do obrigado pro estado "pago", palavra por palavra. */
function fraseDoPagamento(p: PagamentoDoEmail): string {
  if (p.forma === "pix") return "Pix recebido. Já estamos separando o seu pedido."
  return (
    `Pagamento aprovado no cartão ${p.bandeira} final ${p.final}` +
    (p.parcelas > 1 ? `, em ${p.parcelas}x sem juros` : "") +
    ". Já estamos separando o seu pedido."
  )
}

/**
 * "Entrega · Entrega econômica" é o que o obrigado escreve hoje (e está na
 * lista de ajustes do ESTADO.md). Aqui, quando o nome do frete já começa
 * com "Entrega", ele é o rótulo sozinho.
 */
export function rotuloDaEntrega(forma: string): string {
  const f = forma.trim()
  if (!f) return "Entrega"
  return /^entrega\b/i.test(f) ? f : `Entrega · ${f}`
}

/** 5547999990000 → (47) 99999-0000, como o `whatsappNaTela` da loja. */
function whatsappNaTela(digitos: string): string {
  const semDdi = digitos.startsWith("55") ? digitos.slice(2) : digitos
  const m = semDdi.match(/^(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digitos
}

/* ── as partes ────────────────────────────────────────────────────────────── */

const PASSOS_DA_TRILHA = ["Pedido feito", "Pagamento aprovado", "Enviado", "Entregue"]
const FEITOS = 2

/**
 * A TRILHA do pedido — a mesma da tela do pedido na conta. Barra verde no
 * que já aconteceu, cinza no que falta; o rótulo diz de novo, em texto, pra
 * quem não enxerga a cor (e pro app do Gmail, que mexe nas cores).
 */
function trilha(): string {
  const colunas = PASSOS_DA_TRILHA.map((passo, i) => {
    const feito = i < FEITOS
    const barra = feito ? COR.mentaEscura : COR.linha
    const ultimo = i === PASSOS_DA_TRILHA.length - 1
    return (
      `<td width="25%" valign="top" style="width:25%;padding:0 ${ultimo ? 0 : 4}px 0 0;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td class="${feito ? "fb-feito" : "fb-falta"}" height="6" bgcolor="${barra}" ` +
      `style="height:6px;background:${barra};${vazio(6)}">&nbsp;</td></tr></table>` +
      `<p class="${feito ? "fb-texto" : "fb-suave"}" style="margin:0;padding:8px 2px 0 0;font-family:${FONTE};` +
      `font-size:12px;line-height:15px;font-weight:${feito ? 700 : 400};` +
      `color:${feito ? COR.tinta : COR.tintaSuave};mso-line-height-rule:exactly;">${esc(passo)}</p>` +
      `</td>`
    )
  }).join("")
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `aria-label="Pedido feito e pagamento aprovado; falta enviar e entregar."><tr>${colunas}</tr></table>`
  )
}

function linhaDoItem(item: ItemDoEmail): string {
  const detalhe = [item.variante, `${item.quantidade} × ${emReais(item.precoUnitario)}`]
    .filter(Boolean)
    .map(esc)
    .join(" · ")
  const foto = item.imagem
    ? `<img class="fb-foto" src="${esc(item.imagem)}" width="56" height="56" alt="" ` +
      `style="display:block;width:56px;height:56px;border:2px solid ${COR.tinta};background:${COR.cinza};` +
      `object-fit:cover;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td class="fb-foto" width="56" height="56" bgcolor="${COR.cinza}" style="width:56px;height:56px;` +
      `background:${COR.cinza};border:2px solid ${COR.tinta};${vazio(1)}">&nbsp;</td>` +
      `</tr></table>`
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="60" valign="top" style="width:60px;padding:14px 0;">${foto}</td>` +
    `<td valign="top" style="padding:16px 12px 14px 14px;">` +
    paragrafo(esc(item.nome), { tamanho: 14, peso: 700 }) +
    paragrafo(detalhe, { suave: true, tamanho: 13 }) +
    `</td>` +
    `<td valign="top" align="right" style="padding:16px 0 14px;white-space:nowrap;text-align:right;">` +
    paragrafo(esc(emReais(item.total)), { tamanho: 14, peso: 800 }) +
    `</td>` +
    `</tr></table>`
  )
}

function linhaDoTotal(rotuloHtml: string, valorHtml: string, { verde = false } = {}): string {
  return (
    `<tr>` +
    `<td class="fb-suave" style="padding:5px 0;font-family:${FONTE};font-size:14px;line-height:20px;` +
    `color:${COR.tintaSuave};mso-line-height-rule:exactly;">${rotuloHtml}</td>` +
    `<td align="right" class="${verde ? "fb-verde" : "fb-texto"}" style="padding:5px 0;font-family:${FONTE};` +
    `font-size:14px;line-height:20px;font-weight:700;text-align:right;white-space:nowrap;` +
    `color:${verde ? COR.mentaEscura : COR.tinta};mso-line-height-rule:exactly;">${valorHtml}</td>` +
    `</tr>`
  )
}

function totais(p: PedidoDoEmail): string {
  const bordaDoTotal = `border-top:2px solid ${COR.tinta};padding-top:14px;`
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    linhaDoTotal("Produtos", esc(emReais(p.subtotal))) +
    (p.desconto > 0
      ? linhaDoTotal("Desconto", `−${esc(emReais(p.desconto))}`, { verde: true })
      : "") +
    linhaDoTotal(
      esc(rotuloDaEntrega(p.formaDeEntrega)),
      p.frete === 0 ? "Grátis" : esc(emReais(p.frete)),
      { verde: p.frete === 0 }
    ) +
    `<tr><td colspan="2" height="10" style="height:10px;${vazio(10)}">&nbsp;</td></tr>` +
    `<tr>` +
    `<td class="fb-texto fb-linha-forte" style="${bordaDoTotal}font-family:${FONTE};font-size:14px;line-height:20px;` +
    `font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${COR.tinta};` +
    `mso-line-height-rule:exactly;">Total</td>` +
    `<td align="right" class="fb-texto fb-linha-forte" style="${bordaDoTotal}font-family:${FONTE};font-size:24px;` +
    `line-height:28px;font-weight:800;text-align:right;white-space:nowrap;color:${COR.tinta};` +
    `mso-line-height-rule:exactly;">${esc(emReais(p.total))}</td>` +
    `</tr>` +
    `</table>`
  )
}

function numerado(n: number, html: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="26" valign="top" style="width:26px;padding:0 0 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" width="22" height="22" bgcolor="${COR.amarelo}" style="width:22px;height:22px;` +
    `background:${COR.amarelo};border:2px solid ${COR.tinta};font-family:${FONTE};font-size:12px;` +
    `line-height:22px;font-weight:800;color:${COR.tinta};text-align:center;mso-line-height-rule:exactly;">${n}</td>` +
    `</tr></table></td>` +
    `<td valign="top" style="padding:3px 0 12px 12px;">${paragrafo(html, { tamanho: 14 })}</td>` +
    `</tr></table>`
  )
}

/* ── o e-mail ─────────────────────────────────────────────────────────────── */

export function emailDePedidoConfirmado({
  pedido,
  whatsapp,
}: {
  pedido: PedidoDoEmail
  /** Só dígitos, com DDI (5547999990000) — o das configurações da loja. */
  whatsapp: string | null
}): Email {
  const numero = `#${pedido.numero}`
  const assunto = `Pedido ${numero} confirmado`
  const frase = fraseDoPagamento(pedido.pagamento)
  const loja = urlDaLoja()

  /* 1. deu certo */
  const topo = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      (loja
        ? `<img src="${esc(loja)}/email/confirmado.png" width="48" height="48" alt="" ` +
          `style="display:block;margin:0 auto 14px;border:0;width:48px;height:48px;">`
        : "") +
      titulo("Pedido confirmado") +
      espaco(10) +
      // O número é o que a pessoa vai dizer no WhatsApp: vai marcado, como
      // etiqueta, pra ser achado de relance.
      paragrafo(
        `Número <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
          `padding:2px 7px;white-space:nowrap;">${esc(numero)}</span>`,
        { tamanho: 15 }
      ) +
      espaco(6) +
      paragrafo(esc(frase), { suave: true, tamanho: 14 }) +
      `</td></tr></table>` +
      espaco(24) +
      trilha() +
      (loja
        ? espaco(26) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center">${botao({
            texto: "Acompanhar pedido",
            href: `${loja}/conta/pedidos/${encodeURIComponent(pedido.id)}`,
          })}</td></tr></table>`
        : ""),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que foi comprado, e quanto custou */
  const compra = cartao(
    rotulo("O que você comprou") +
      espaco(4) +
      pedido.itens.map(linhaDoItem).join(divisor()) +
      espaco(6) +
      divisor() +
      espaco(12) +
      totais(pedido)
  )

  /* 3. pra onde vai, e o que acontece agora */
  const e = pedido.entrega
  const endereco = e
    ? [e.nome, e.linha1, e.linha2, `${e.cidade}/${e.uf} · ${e.cep}`]
        .filter(Boolean)
        .map(esc)
        .join("<br>")
    : ""
  const passos = [
    "A encomenda entra na fila de separação.",
    "Ela é postada, e o prazo de entrega começa a contar daí.",
    "O código de rastreio chega por e-mail assim que ela for postada.",
  ]
  const ajuda = whatsapp
    ? `Qualquer coisa, chama no WhatsApp <a href="https://wa.me/${esc(whatsapp)}" target="_blank" ` +
      `style="color:${COR.tinta};font-weight:700;text-decoration:underline;white-space:nowrap;" class="fb-texto">` +
      `${esc(whatsappNaTela(whatsapp))}</a> com o número <b>${esc(numero)}</b>.`
    : `Guarde o número <b>${esc(numero)}</b>: é por ele que a gente encontra seu pedido.`

  const depois = cartao(
    (endereco
      ? rotulo("Pra onde vai") +
        espaco(10) +
        paragrafo(endereco, { tamanho: 14 }) +
        espaco(20) +
        divisor() +
        espaco(20)
      : "") +
      rotulo("E agora?") +
      espaco(14) +
      passos.map((p, i) => numerado(i + 1, esc(p))).join("") +
      espaco(4) +
      paragrafo(ajuda, { suave: true, tamanho: 13 })
  )

  const html = moldura({
    assunto,
    previa: frase,
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
    `FuckingBarba — pedido ${numero} confirmado`,
    "",
    frase,
    "",
    "O QUE VOCÊ COMPROU",
    ...pedido.itens.map(
      (i) =>
        `- ${i.nome}${i.variante ? ` (${i.variante})` : ""}: ${i.quantidade} × ${emReais(i.precoUnitario)} = ${emReais(i.total)}`
    ),
    "",
    `Produtos: ${emReais(pedido.subtotal)}`,
    ...(pedido.desconto > 0 ? [`Desconto: −${emReais(pedido.desconto)}`] : []),
    `${rotuloDaEntrega(pedido.formaDeEntrega)}: ${pedido.frete === 0 ? "Grátis" : emReais(pedido.frete)}`,
    `Total: ${emReais(pedido.total)}`,
    ...(e
      ? [
          "",
          "PRA ONDE VAI",
          e.nome,
          e.linha1,
          ...(e.linha2 ? [e.linha2] : []),
          `${e.cidade}/${e.uf} · ${e.cep}`,
        ]
      : []),
    "",
    "E AGORA?",
    ...passos.map((p, i) => `${i + 1}. ${p}`),
    "",
    whatsapp
      ? `Qualquer coisa, chama no WhatsApp ${whatsappNaTela(whatsapp)} com o número ${numero}.`
      : `Guarde o número ${numero}: é por ele que a gente encontra seu pedido.`,
    ...(loja
      ? ["", `Acompanhar o pedido: ${loja}/conta/pedidos/${encodeURIComponent(pedido.id)}`]
      : []),
  ].join("\n")

  return { para: pedido.email, assunto, html, texto }
}
