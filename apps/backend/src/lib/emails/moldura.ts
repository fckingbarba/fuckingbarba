/**
 * A MOLDURA DOS E-MAILS — o que todo e-mail da loja tem em volta do conteúdo.
 *
 * A cara é a do site: a barra preta com a logo em cima, o fundo menta, os
 * blocos brancos com borda de 2 px e sombra dura, título em caixa alta. As
 * cores são os tokens do `globals.css` da loja, copiados — e-mail não lê CSS
 * de ninguém.
 *
 * ┌─ HTML DE E-MAIL É HTML DE 2005 ────────────────────────────────────────┐
 * │ Tabela pra tudo, estilo EM LINHA em cada célula, cor de fundo em       │
 * │ `bgcolor` E em `background` (o Outlook do Windows desenha com o motor  │
 * │ do Word e só entende o primeiro). Nada de SVG, `div` com margem, flex, │
 * │ `border-radius` (a marca nem usa) ou `box-shadow` — a sombra dura dos  │
 * │ blocos é feita de CÉLULAS pintadas, ver `cartao`. O `<style>` do       │
 * │ cabeçalho só acrescenta: celular, modo escuro, links que o iPhone      │
 * │ pinta de azul. Leitor que joga o `<style>` fora (o Gmail com conta     │
 * │ que não é do Google) ainda recebe um e-mail inteiro e legível.         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * MODO ESCURO: o Apple Mail e o Outlook.com respeitam o que a gente pede
 * (fundo quase preto, blocos grafite, sombra menta); o app do Gmail ignora e
 * inverte as cores do jeito dele, e por isso nada aqui depende de cor pra
 * ser entendido.
 *
 * TUDO O QUE VEM DE FORA PASSA POR `esc`: nome de produto vem do admin, nome
 * e endereço vêm do checkout — um `<a href>` num nome viraria um link dentro
 * de um e-mail com a nossa marca.
 */

export const COR = {
  preto: "#000000",
  tinta: "#12181f",
  tintaSuave: "#566072",
  papel: "#ffffff",
  cinza: "#f2f3f4",
  linha: "#cfd5dc",
  menta: "#4fe4b6",
  mentaBotao: "#4fe0b9",
  mentaEscura: "#0b7f62",
  amarelo: "#ffd84d",
  amareloClaro: "#fff3c4",
  tintaDoBotao: "#07120e",
} as const

/** O modo escuro, pros leitores que deixam a gente escolher. */
const ESCURO = {
  pagina: "#0e1318",
  cartao: "#161d25",
  borda: "#3a4654",
  texto: "#eef1f4",
  suave: "#a3adba",
  linha: "#2c3642",
} as const

/** A Inter do site onde o leitor baixa fonte (Apple Mail); o resto cai na do sistema. */
export const FONTE =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const SOMBRA = 6

/* ── ferramentas ──────────────────────────────────────────────────────────── */

const ENTIDADES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Texto que entra no HTML. Sempre — ver a última caixa lá em cima. */
export function esc(valor: unknown): string {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c)
}

/**
 * O endereço da loja, de `LOJA_URL` (a mesma variável da revalidação). É de
 * lá que o e-mail puxa a logo (`apps/loja/public/email/`) e pra lá que os
 * links apontam. Sem ela, a logo vira texto e os links somem — o e-mail
 * continua saindo.
 */
export function urlDaLoja(): string | null {
  const url = (process.env.LOJA_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\/[^\s]+$/.test(url) ? url : null
}

/** 54.9 → "R$ 54,90", como o `emReais` da loja (o espaço é o fixo, U+00A0). */
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export function emReais(valor: number): string {
  return REAIS.format(valor)
}

/* ── as peças ─────────────────────────────────────────────────────────────── */

const estiloDoTexto = (tamanho: number, altura: number, peso = 400) =>
  `margin:0;font-family:${FONTE};font-size:${tamanho}px;line-height:${altura}px;` +
  `font-weight:${peso};mso-line-height-rule:exactly;`

/**
 * O estilo de uma célula que só existe pelo tamanho (espaço, faixa de
 * sombra, linha). Fonte e entrelinha DO TAMANHO da célula, e não zero: o
 * Outlook do Windows ignora `font-size:0` e estica a célula até caber uma
 * linha de texto — a sombra de 6 px viraria uma faixa de 15.
 */
export const vazio = (px: number) =>
  `font-size:${px}px;line-height:${px}px;mso-line-height-rule:exactly;`

/** Espaço em branco na vertical — margem de `<p>` o Outlook não respeita. */
export function espaco(altura: number): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td height="${altura}" style="height:${altura}px;${vazio(altura)}">&nbsp;</td></tr></table>`
  )
}

/**
 * A SOMBRA DURA DA MARCA (`--shadow-dura`), em células.
 *
 * `box-shadow` não existe no Outlook nem no Gmail, então a sombra é feita
 * de três células em volta da que tem o conteúdo: uma faixa à direita, uma
 * embaixo e o canto. O "dente" no alto da faixa direita e no começo da de
 * baixo — o que faz ela parecer sombra deslocada, e não borda grossa — é
 * uma borda da cor do que está atrás (`fundo`).
 *
 * `celula` é o `<td>` inteiro do conteúdo. As classes são as do modo
 * escuro: a sombra muda de cor, e o dente acompanha o fundo.
 */
export function comSombra({
  celula,
  cor,
  tamanho,
  fundo,
  largura,
  classeDaSombra = "",
  classeDoDente = "",
}: {
  celula: string
  cor: string
  tamanho: number
  fundo: string
  largura?: string
  classeDaSombra?: string
  classeDoDente?: string
}): string {
  const t = tamanho
  const faixa = `bgcolor="${cor}"`
  return (
    `<table role="presentation"${largura ? ` width="${largura}"` : ""} cellpadding="0" cellspacing="0" ` +
    `border="0" style="border-collapse:separate;border-spacing:0;">` +
    `<tr>${celula}` +
    `<td class="${classeDaSombra} ${classeDoDente}" width="${t}" ${faixa} ` +
    `style="width:${t}px;background:${cor};border-top:${t}px solid ${fundo};${vazio(t)}">&nbsp;</td></tr>` +
    `<tr><td class="${classeDaSombra} ${classeDoDente}" height="${t}" ${faixa} ` +
    `style="height:${t}px;background:${cor};border-left:${t}px solid ${fundo};${vazio(t)}">&nbsp;</td>` +
    `<td class="${classeDaSombra}" width="${t}" height="${t}" ${faixa} ` +
    `style="width:${t}px;height:${t}px;background:${cor};${vazio(t)}">&nbsp;</td></tr>` +
    `</table>`
  )
}

/**
 * UM BLOCO BRANCO — o `.bloco` do checkout (borda de 2 px) com a sombra
 * dura do site. No modo escuro, bloco grafite e sombra menta.
 */
export function cartao(html: string, { respiro = "28px 28px" }: { respiro?: string } = {}): string {
  return (
    comSombra({
      celula:
        `<td class="fb-cartao fb-pad" bgcolor="${COR.papel}" style="background:${COR.papel};` +
        `border:2px solid ${COR.tinta};padding:${respiro};">${html}</td>`,
      cor: COR.tinta,
      tamanho: SOMBRA,
      fundo: COR.menta,
      largura: "100%",
      classeDaSombra: "fb-sombra",
      classeDoDente: "fb-dente-pagina",
    }) + espaco(22)
  )
}

/** O título do e-mail: caixa alta, 800, como o `h1` do obrigado. */
export function titulo(texto: string): string {
  return (
    `<h1 class="fb-texto fb-titulo" style="${estiloDoTexto(26, 30, 800)}color:${COR.tinta};` +
    `text-transform:uppercase;letter-spacing:0.01em;">${esc(texto)}</h1>`
  )
}

/** O título de um bloco — o `.bloco__titulo` do checkout. */
export function rotulo(texto: string): string {
  return (
    `<h2 class="fb-texto" style="${estiloDoTexto(14, 18, 800)}color:${COR.tinta};` +
    `text-transform:uppercase;letter-spacing:0.06em;">${esc(texto)}</h2>`
  )
}

/** Um parágrafo. Recebe HTML: quem chama escapa o que veio de fora. */
export function paragrafo(
  html: string,
  {
    suave = false,
    tamanho = 15,
    peso = 400,
  }: { suave?: boolean; tamanho?: number; peso?: number } = {}
): string {
  const altura = Math.round(tamanho * 1.5)
  return (
    `<p class="${suave ? "fb-suave" : "fb-texto"}" style="${estiloDoTexto(tamanho, altura, peso)}` +
    `color:${suave ? COR.tintaSuave : COR.tinta};">${html}</p>`
  )
}

/** Uma linha fina de divisão, dentro de um bloco. */
export function divisor(): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="fb-linha" style="border-top:1px solid ${COR.linha};height:1px;${vazio(1)}">&nbsp;</td>` +
    `</tr></table>`
  )
}

/**
 * O BOTÃO DA LOJA: menta, letra de tinta em caixa alta, o raio do lado e a
 * sombra amarela — o `.btn` do `base.css`. A sombra é a mesma arquitetura
 * de células do `cartao`, com 4 px.
 *
 * O link cobre o botão inteiro (padding no `<a>`, não na célula) em todo
 * leitor menos o Outlook do Windows, onde só o texto é clicável — o preço
 * de não usar VML, que ninguém consegue manter.
 */
export function botao({ texto, href }: { texto: string; href: string }): string {
  const base = urlDaLoja()
  const raio = base
    ? `&nbsp;&nbsp;<img src="${esc(base)}/email/raio.png" width="15" height="15" alt="" ` +
      `style="display:inline-block;vertical-align:-2px;border:0;width:15px;height:15px;">`
    : ""
  return comSombra({
    celula:
      `<td bgcolor="${COR.mentaBotao}" style="background:${COR.mentaBotao};border:2px solid ${COR.tinta};">` +
      `<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 26px;` +
      `font-family:${FONTE};font-size:14px;line-height:18px;font-weight:800;letter-spacing:0.05em;` +
      `text-transform:uppercase;text-decoration:none;color:${COR.tintaDoBotao};mso-line-height-rule:exactly;">` +
      `${esc(texto)}${raio}</a></td>`,
    cor: COR.amarelo,
    tamanho: 4,
    fundo: COR.papel,
    classeDoDente: "fb-dente",
  })
}

/* ── a moldura ────────────────────────────────────────────────────────────── */

/**
 * A logo, ou o nome em texto quando não há `LOJA_URL`. O texto alternativo
 * da imagem já vem com a cara da marca: quem abre com imagem bloqueada
 * (o Outlook do Windows faz isso por padrão) lê "FuckingBarba" em branco, e
 * não um quadrado vazio.
 */
function logo(): string {
  const base = urlDaLoja()
  if (base) {
    return (
      `<img src="${esc(base)}/email/logo.png" width="120" height="96" alt="FuckingBarba" ` +
      `style="display:block;margin:0 auto;border:0;width:120px;height:96px;` +
      `font-family:${FONTE};font-size:22px;line-height:96px;font-weight:800;color:${COR.papel};text-align:center;">`
    )
  }
  return (
    `<p style="${estiloDoTexto(24, 28, 800)}color:${COR.papel};text-transform:uppercase;letter-spacing:0.04em;` +
    `font-style:italic;">Fucking<span style="color:${COR.amarelo};">Barba</span></p>`
  )
}

/** Os caracteres que seguram a prévia da caixa de entrada no lugar. */
const ENCHIMENTO = "&#847;&zwnj;&nbsp;".repeat(90)

/*
  QUATRO BLOCOS DE <style>, e não um: o Gmail joga fora o bloco INTEIRO
  quando encontra algo que não entende (seletor de atributo, de id). O que
  importa pra ele — o celular — vai sozinho num bloco limpo; o resto fica
  com quem sabe ler.
*/

/** Os consertos de sempre: o azul que o iPhone e o Gmail pintam em data e endereço, o zoom do iOS. */
const CSS_LIMPEZA = `
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-feature-settings:"ss01","cv11";}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
u + #corpo a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}
#MessageViewBody a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}`

/** No celular: menos margem, bloco mais justo, título e código menores. */
const CSS_CELULAR = `@media only screen and (max-width:600px){
.fb-lado{padding-left:14px!important;padding-right:14px!important;}
.fb-pad{padding:22px 18px!important;}
.fb-titulo{font-size:22px!important;line-height:26px!important;}
.fb-codigo{font-size:32px!important;letter-spacing:8px!important;padding-left:8px!important;}
}`

const REGRAS_ESCURAS = [
  `.fb-pagina{background:${ESCURO.pagina}!important;}`,
  `.fb-cartao{background:${ESCURO.cartao}!important;border-color:${ESCURO.borda}!important;}`,
  `.fb-sombra{background:${COR.menta}!important;}`,
  `.fb-dente-pagina{border-color:${ESCURO.pagina}!important;}`,
  `.fb-dente{border-color:${ESCURO.cartao}!important;}`,
  `.fb-texto{color:${ESCURO.texto}!important;}`,
  `.fb-suave{color:${ESCURO.suave}!important;}`,
  `.fb-linha{border-color:${ESCURO.linha}!important;}`,
  `.fb-linha-forte{border-color:${ESCURO.suave}!important;}`,
  `.fb-foto{border-color:${ESCURO.borda}!important;background:${ESCURO.pagina}!important;}`,
  `.fb-falta{background:${ESCURO.linha}!important;}`,
  `.fb-feito{background:${COR.menta}!important;}`,
  `.fb-rodape{color:${ESCURO.suave}!important;}`,
  `.fb-verde{color:${COR.menta}!important;}`,
]

/*
  O Outlook.com escurece sozinho e marca o que mexeu: `data-ogsc` onde trocou
  a cor do texto, `data-ogsb` onde trocou o fundo. As mesmas regras, com
  esses prefixos, dizem pra ele as cores que a gente quer.
*/
const CSS_ESCURO = `@media (prefers-color-scheme:dark){${REGRAS_ESCURAS.join("")}}`
const CSS_OUTLOOK = REGRAS_ESCURAS.map((r) => `[data-ogsc] ${r}[data-ogsb] ${r}`).join("")

export type Moldura = {
  /** O assunto — vai também no `<title>`, que alguns leitores mostram. */
  assunto: string
  /** A linha cinza que aparece do lado do assunto na caixa de entrada. */
  previa: string
  /** Os blocos, já montados com `cartao`. */
  conteudo: string
  /** O pé: o porquê de a pessoa ter recebido o e-mail. HTML, já escapado. */
  rodape: string
  /** Links do pé (loja, Instagram). O e-mail do código não leva nenhum. */
  links?: { texto: string; href: string }[]
}

export function moldura({ assunto, previa, conteudo, rodape, links = [] }: Moldura): string {
  const linhaDeLinks = links.length
    ? `<p class="fb-rodape" style="${estiloDoTexto(13, 20, 800)}color:${COR.tinta};text-transform:uppercase;` +
      `letter-spacing:0.06em;padding:0 0 12px;">` +
      links
        .map(
          (l) =>
            `<a href="${esc(l.href)}" target="_blank" class="fb-rodape" style="color:${COR.tinta};text-decoration:underline;">${esc(l.texto)}</a>`
        )
        .join(`&nbsp;&nbsp;·&nbsp;&nbsp;`) +
      `</p>`
    : ""

  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(assunto)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if mso]><style>table,td,p,a,span,h1,h2{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet"><!--<![endif]-->
<style>${CSS_LIMPEZA}</style>
<style>${CSS_CELULAR}</style>
<style>${CSS_ESCURO}</style>
<style>${CSS_OUTLOOK}</style>
</head>
<body id="corpo" class="fb-pagina" style="margin:0;padding:0;background:${COR.menta};">
<div role="article" aria-roledescription="email" aria-label="${esc(assunto)}" lang="pt-BR">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;">${esc(previa)}${ENCHIMENTO}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fb-pagina" bgcolor="${COR.menta}" style="background:${COR.menta};">
<tr><td align="center" bgcolor="${COR.preto}" style="background:${COR.preto};padding:22px 16px;">${logo()}</td></tr>
<tr><td height="4" bgcolor="${COR.amarelo}" style="height:4px;background:${COR.amarelo};${vazio(4)}">&nbsp;</td></tr>
<tr><td align="center" class="fb-lado" style="padding:34px 20px 0;">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">
<tr><td style="text-align:left;">${conteudo}</td></tr>
<tr><td align="center" style="padding:14px 8px 40px;text-align:center;">
<p class="fb-rodape" style="${estiloDoTexto(13, 20, 800)}color:${COR.tinta};text-transform:uppercase;letter-spacing:0.06em;">Ousamos, criamos, cuidamos.</p>
<p class="fb-rodape" style="${estiloDoTexto(13, 20)}color:${COR.tinta};padding:0 0 14px;">Cosméticos masculinos de alta performance.</p>
${linhaDeLinks}
<p class="fb-rodape" style="${estiloDoTexto(12, 18)}color:${COR.tinta};">${rodape}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`
}
