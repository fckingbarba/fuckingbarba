import type { Email } from "../email"
import {
  botao,
  cartao,
  COR,
  divisor,
  esc,
  espaco,
  FONTE,
  moldura,
  paragrafo,
  rotulo,
  titulo,
  urlDaLoja,
} from "./moldura"
import { whatsappNaTela } from "./pedido-confirmado"

/**
 * O E-MAIL QUE PEDE A AVALIAÇÃO — "o que você achou?", um dia depois da
 * entrega, com um botão pra cada produto do pedido.
 *
 * Só o desenho. Quem manda, quando e uma vez por pedido é o
 * `lib/avaliacoes/pedir.ts`.
 *
 * O BOTÃO LEVA O LINK ASSINADO DO PEDIDO (`/avaliar/<link>`): a loja guarda
 * o link num cookie e abre a página limpa, `/avaliar?produto=…`, com o
 * produto já escolhido — o link não fica no endereço, no histórico nem no
 * Google Analytics. E leva UTM (`utm_campaign=avaliacao`), como o avise-me:
 * no painel, a visita aparece em Marketing → Canais como "E-mail".
 *
 * O QUE A PESSOA PRECISA SABER ANTES DE CLICAR vai no e-mail: é rápido, o
 * nome que aparece no site é o que ela escolher, e a nota passa pela loja
 * antes de ir pro site. E, pra quem teve problema, o WhatsApp — reclamação
 * de pedido se resolve conversando, não numa nota de uma estrela.
 */

export type ProdutoParaAvaliar = {
  id: string
  nome: string
  /** URL absoluta da foto (a do Medusa), ou null. */
  imagem: string | null
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"
const TIKTOK = "https://www.tiktok.com/@fuckingbarba"
const UTM = "utm_source=loja&utm_medium=email&utm_campaign=avaliacao"

/** O endereço que abre a página de avaliação deste pedido, com o produto escolhido. */
export function linkDaAvaliacao(loja: string, link: string, produtoId: string): string {
  return (
    `${loja}/avaliar/${encodeURIComponent(link)}` +
    `?produto=${encodeURIComponent(produtoId)}&${UTM}`
  )
}

const FOTO = 72

/** A linha de um produto: a foto, o nome e o botão. */
function linhaDoProduto(p: ProdutoParaAvaliar, href: string | null): string {
  const foto = p.imagem
    ? `<img class="fb-foto" src="${esc(p.imagem)}" width="${FOTO}" height="${FOTO}" alt="" ` +
      `style="display:block;width:${FOTO}px;height:${FOTO}px;border:2px solid ${COR.tinta};` +
      `background:${COR.cinza};object-fit:cover;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td width="${FOTO}" height="${FOTO}" bgcolor="${COR.cinza}" style="width:${FOTO}px;height:${FOTO}px;` +
      `background:${COR.cinza};border:2px solid ${COR.tinta};font-size:1px;line-height:1px;">&nbsp;</td>` +
      `</tr></table>`
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="${FOTO + 16}" valign="middle" style="width:${FOTO + 16}px;">${foto}</td>` +
    `<td valign="middle" style="font-family:${FONTE};">` +
    paragrafo(esc(p.nome), { tamanho: 15, peso: 700 }) +
    (href ? espaco(10) + botao({ texto: "Avaliar", href }) : "") +
    `</td></tr></table>`
  )
}

export function emailDePedirAvaliacao({
  para,
  numero,
  primeiroNome,
  link,
  produtos,
  whatsapp,
}: {
  para: string
  numero: number
  /** "Rafael" — ou vazio, sem nome no pedido. */
  primeiroNome: string
  /** O `p` do pedido (`linkDoPedido`). */
  link: string
  produtos: ProdutoParaAvaliar[]
  /** Só dígitos, com DDI — o das configurações da loja. */
  whatsapp: string | null
}): Email {
  const n = `#${numero}`
  const assunto = `Pedido ${n}: o que você achou?`
  const previa = "Dê as estrelas e conte como foi. Leva um minuto."
  const loja = urlDaLoja()
  const oi = primeiroNome ? `Oi, ${primeiroNome}! ` : ""
  const umSo = produtos.length === 1
  const abertura =
    `${oi}Seu pedido chegou faz um dia. Conta pra gente o que achou ` +
    (umSo ? "dele" : "de cada um") +
    ": a sua nota ajuda quem ainda está em dúvida — e ajuda a gente a melhorar."

  /* 1. o pedido e a pergunta */
  const topo = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      (loja
        ? `<img src="${esc(loja)}/email/confirmado.png" width="48" height="48" alt="" ` +
          `style="display:block;margin:0 auto 14px;border:0;width:48px;height:48px;">`
        : "") +
      titulo("O que você achou?") +
      espaco(10) +
      paragrafo(
        `Pedido <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
          `padding:2px 7px;white-space:nowrap;">${esc(n)}</span>`,
        { tamanho: 15 }
      ) +
      espaco(8) +
      paragrafo(esc(abertura), { suave: true, tamanho: 14 }) +
      `</td></tr></table>`,
    { respiro: "32px 28px 30px" }
  )

  /* 2. um botão por produto */
  const linhas = produtos
    .map((p) => linhaDoProduto(p, loja ? linkDaAvaliacao(loja, link, p.id) : null))
    .join(espaco(16) + divisor() + espaco(16))
  const ajuda = whatsapp
    ? `Chegou alguma coisa errada? Antes de dar a nota, chama no WhatsApp ` +
      `<a href="https://wa.me/${esc(whatsapp)}" target="_blank" class="fb-texto" ` +
      `style="color:${COR.tinta};font-weight:700;text-decoration:underline;white-space:nowrap;">` +
      `${esc(whatsappNaTela(whatsapp))}</a> com o número <b>${esc(n)}</b> — a gente resolve.`
    : `Chegou alguma coisa errada? Antes de dar a nota, fale com a gente ` +
      (loja
        ? `pelo <a href="${esc(loja)}/contato" target="_blank" class="fb-texto" ` +
          `style="color:${COR.tinta};font-weight:700;text-decoration:underline;">contato</a> `
        : "") +
      `com o número <b>${esc(n)}</b> — a gente resolve.`
  const meio = cartao(
    rotulo(umSo ? "Avalie o que chegou" : "Avalie o que chegou, um por um") +
      espaco(14) +
      linhas +
      espaco(22) +
      paragrafo(
        "Leva um minuto: as estrelas e umas palavras. No site aparece o nome que você escolher, " +
          "depois que a loja lê a avaliação.",
        { suave: true, tamanho: 13 }
      ) +
      espaco(10) +
      paragrafo(ajuda, { suave: true, tamanho: 13 })
  )

  const html = moldura({
    assunto,
    previa,
    conteudo: topo + meio,
    rodape:
      `Você recebeu porque fez o pedido ${esc(n)} na FuckingBarba. É o único pedido de avaliação ` +
      `desta compra.`,
    links: [
      ...(loja ? [{ texto: "Loja", href: loja }] : []),
      { texto: "Instagram", href: INSTAGRAM },
      { texto: "TikTok", href: TIKTOK },
    ],
  })

  const texto = [
    `FuckingBarba — pedido ${n}: o que você achou?`,
    "",
    abertura,
    "",
    ...produtos.flatMap((p) => [
      `- ${p.nome}`,
      ...(loja ? [`  Avaliar: ${linkDaAvaliacao(loja, link, p.id)}`] : []),
    ]),
    "",
    "Leva um minuto: as estrelas e umas palavras. No site aparece o nome que você escolher,",
    "depois que a loja lê a avaliação.",
    "",
    whatsapp
      ? `Chegou alguma coisa errada? Chama no WhatsApp ${whatsappNaTela(whatsapp)} com o número ${n} — a gente resolve.`
      : `Chegou alguma coisa errada? Fale com a gente${loja ? ` (${loja}/contato)` : ""} com o número ${n} — a gente resolve.`,
    "",
    `É o único pedido de avaliação desta compra.`,
    `Instagram: ${INSTAGRAM} · TikTok: ${TIKTOK}`,
  ].join("\n")

  return { para, assunto, html, texto }
}
