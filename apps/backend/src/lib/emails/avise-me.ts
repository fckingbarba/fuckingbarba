import type { Email } from "../email"
import {
  botao,
  cartao,
  COR,
  emReais,
  esc,
  espaco,
  moldura,
  paragrafo,
  titulo,
  urlDaLoja,
} from "./moldura"

/**
 * O E-MAIL DO AVISE-ME — "voltou pro estoque", pra quem pediu na página do
 * produto esgotado.
 *
 * Só o desenho. Quem manda, quando e pra quem (uma vez por pedido, com o
 * produto de volta no site) é o `lib/avise-me.ts`.
 *
 * UM AVISO SÓ, E ELE DIZ ISSO: depois dele o e-mail da pessoa sai da lista de
 * espera (a linha fica sem o endereço). Nada de "fique de olho nas
 * novidades" — quem quer novidade assina a newsletter, que é outro "sim".
 *
 * O LINK LEVA UTM (`utm_medium=email`, `utm_campaign=avise-me`): no painel,
 * Marketing → Canais, a visita e a compra que vieram daqui aparecem como
 * "E-mail", na campanha "avise-me".
 */

export type ProdutoQueVoltou = {
  nome: string
  handle: string
  /** URL absoluta da foto (a do Medusa), ou null. */
  imagem: string | null
  /** O que a loja cobra por uma unidade agora, ou null sem preço. */
  preco: number | null
  /** O riscado — só quando há promoção (maior que `preco`). */
  precoCheio: number | null
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"
const TIKTOK = "https://www.tiktok.com/@fuckingbarba"

/** O endereço do produto na loja, com a marca de onde a visita veio. */
export function linkDoAviso(loja: string, handle: string): string {
  return (
    `${loja}/produtos/${encodeURIComponent(handle)}` +
    "?utm_source=loja&utm_medium=email&utm_campaign=avise-me"
  )
}

/** A foto do produto, grande e no meio — ou nada, sem foto. */
function foto(imagem: string | null): string {
  if (!imagem) return ""
  return (
    `<img class="fb-foto" src="${esc(imagem)}" width="200" height="200" alt="" ` +
    `style="display:block;margin:0 auto;width:200px;height:200px;border:2px solid ${COR.tinta};` +
    `background:${COR.cinza};object-fit:cover;">` +
    espaco(18)
  )
}

/** "R$ 49,90", com o "de" riscado ao lado quando há promoção. */
function linhaDoPreco(p: ProdutoQueVoltou): string {
  if (p.preco === null) return ""
  const cheio =
    p.precoCheio !== null && p.precoCheio > p.preco
      ? `&nbsp;&nbsp;<s class="fb-suave" style="color:${COR.tintaSuave};font-weight:400;font-size:15px;">` +
        `${esc(emReais(p.precoCheio))}</s>`
      : ""
  return espaco(6) + paragrafo(`${esc(emReais(p.preco))}${cheio}`, { tamanho: 20, peso: 800 })
}

export function emailDeVolta({
  para,
  produto,
}: {
  para: string
  produto: ProdutoQueVoltou
}): Email {
  const assunto = `Voltou: ${produto.nome}`
  const previa = "Chegou reposição. Quem compra primeiro leva — este é o único aviso."
  const loja = urlDaLoja()
  const link = loja ? linkDoAviso(loja, produto.handle) : null

  const bloco = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      foto(produto.imagem) +
      titulo("Voltou pro estoque") +
      espaco(10) +
      paragrafo(esc(produto.nome), { tamanho: 17, peso: 700 }) +
      linhaDoPreco(produto) +
      espaco(12) +
      paragrafo(
        "Você pediu pra saber quando ele voltasse: chegou. O estoque é o que chegou, sem " +
          "reserva — quem compra primeiro leva.",
        { suave: true, tamanho: 14 }
      ) +
      (link
        ? espaco(24) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center">${botao({ texto: "Comprar agora", href: link })}</td></tr></table>`
        : "") +
      `</td></tr></table>`,
    { respiro: "32px 28px 30px" }
  )

  const html = moldura({
    assunto,
    previa,
    conteudo: bloco,
    rodape:
      `Você recebeu porque pediu, na página do ${esc(produto.nome)}, pra ser avisado quando ele ` +
      `voltasse. Foi o único aviso: o seu e-mail já saiu da lista de espera.`,
    links: [
      ...(loja ? [{ texto: "Loja", href: loja }] : []),
      { texto: "Instagram", href: INSTAGRAM },
      { texto: "TikTok", href: TIKTOK },
    ],
  })

  const preco =
    produto.preco === null
      ? []
      : [
          produto.precoCheio !== null && produto.precoCheio > produto.preco
            ? `${emReais(produto.preco)} (de ${emReais(produto.precoCheio)})`
            : emReais(produto.preco),
        ]
  const texto = [
    "FuckingBarba — voltou pro estoque",
    "",
    produto.nome,
    ...preco,
    "",
    "Você pediu pra saber quando ele voltasse: chegou. O estoque é o que chegou, sem reserva —",
    "quem compra primeiro leva.",
    ...(link ? ["", `Comprar: ${link}`] : []),
    "",
    "Foi o único aviso: o seu e-mail já saiu da lista de espera.",
    `Instagram: ${INSTAGRAM} · TikTok: ${TIKTOK}`,
  ].join("\n")

  return { para, assunto, html, texto }
}
