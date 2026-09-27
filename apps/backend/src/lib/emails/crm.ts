import type { Email } from "../email"
import {
  botao,
  cartao,
  COR,
  emReais,
  esc,
  espaco,
  FONTE,
  moldura,
  paragrafo,
  rotulo,
  titulo,
} from "./moldura"

/**
 * O MODELO DOS E-MAILS DO CRM — um só, montado em blocos (o "modelo único"
 * do plano do "Ciclo da Barba"). A moldura é a da loja (`moldura.ts`): a barra
 * preta com a logo, o fundo menta, os blocos brancos com a sombra dura.
 *
 * Por cima dela, o e-mail de oferta tem sempre o mesmo esqueleto:
 *   1. o "Oi, Rafael", o título, o texto e o botão principal;
 *   2. os blocos, na ordem que o fluxo pedir — produtos (com foto e preço),
 *      cupom, depoimento, os passos da rotina, um selo, mais texto;
 *   3. o rodapé: por que a pessoa recebeu, o SAIR DA LISTA EM 1 CLIQUE, a
 *      empresa com o CNPJ, e os links (loja, Instagram, TikTok, WhatsApp).
 *
 * O SAIR DA LISTA vai em dois lugares: no rodapé (a página `/sair/<t>` da
 * loja, que pergunta antes) e no cabeçalho `List-Unsubscribe`, com o
 * `List-Unsubscribe-Post` do clique único (RFC 8058) — o "cancelar
 * inscrição" que o Gmail e o Mail do iPhone mostram no alto do e-mail, e que
 * o Gmail e o Yahoo cobram de quem manda oferta.
 *
 * TODO LINK PRA LOJA LEVA UTM (`utm_medium=email`, `utm_campaign=crm-…`): no
 * painel, Marketing → Canais, a visita e a compra aparecem como "E-mail".
 *
 * Só o desenho: quem manda, quando e pra quem são os fluxos. Código puro,
 * com testes.
 */

export type ProdutoDoCrm = {
  nome: string
  handle: string
  /** URL absoluta da foto (a do Medusa), ou null. */
  imagem: string | null
  /** O que a loja cobra por uma unidade agora, ou null sem preço. */
  preco: number | null
  /** O riscado — só quando há promoção (maior que `preco`). */
  precoCheio: number | null
}

export type BlocoDoCrm =
  | { tipo: "texto"; texto: string }
  | { tipo: "produtos"; titulo?: string; produtos: ProdutoDoCrm[] }
  | { tipo: "cupom"; codigo: string; oque: string; validade: string }
  | { tipo: "depoimento"; texto: string; quem: string; estrelas?: number }
  | { tipo: "passos"; titulo?: string; passos: string[] }
  | { tipo: "selo"; texto: string }
  /** O Pix do pedido: o copia e cola, o QR (só se for um endereço https) e até quando vale. */
  | { tipo: "pix"; codigo: string; imagem: string | null; vence: string }

export type EmailDoCrm = {
  para: string
  /** O primeiro nome, pro "Oi, Rafael". Sem ele, "Oi!". */
  nome: string | null
  assunto: string
  /** A linha cinza do lado do assunto, na caixa de entrada. */
  previa: string
  titulo: string
  texto: string
  blocos: BlocoDoCrm[]
  /**
   * A frase do pé: por que a pessoa recebeu. Sem ela, a das ofertas ("aceitou
   * receber ofertas"); os fluxos de compra dizem que ela começou uma compra.
   */
  porque?: string
  /** O botão principal: o texto e o caminho na loja ("/produtos/oleo-para-barba"). */
  botao?: { texto: string; caminho: string }
  /** O nome da campanha — no UTM (`crm-<campanha>`) e na etiqueta `tipo` do Resend. */
  campanha: string
  /** A página de sair da lista (a da loja) e o endereço do clique único (o do backend). */
  sair: { pagina: string; umClique: string | null }
  loja: { url: string; whatsapp: string | null; empresa: string | null; cnpj: string | null }
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"
const TIKTOK = "https://www.tiktok.com/@fuckingbarba"
const FOTO = 72

/** O endereço na loja, com a marca de onde a visita veio. */
export function linkDoCrm(loja: string, caminho: string, campanha: string): string {
  const [base, busca = ""] = caminho.split("?")
  const utm = `utm_source=loja&utm_medium=email&utm_campaign=crm-${encodeURIComponent(campanha)}`
  return `${loja}${base.startsWith("/") ? base : `/${base}`}?${busca ? `${busca}&` : ""}${utm}`
}

/** "R$ 49,90", com o "de" riscado ao lado quando há promoção. */
function preco(p: ProdutoDoCrm): string {
  if (p.preco === null) return ""
  const cheio =
    p.precoCheio !== null && p.precoCheio > p.preco
      ? `&nbsp;&nbsp;<s class="fb-suave" style="color:${COR.tintaSuave};font-weight:400;font-size:13px;">` +
        `${esc(emReais(p.precoCheio))}</s>`
      : ""
  return paragrafo(`${esc(emReais(p.preco))}${cheio}`, { tamanho: 15, peso: 800 })
}

/** A foto quadrada do produto, ou um quadrado cinza. */
function foto(imagem: string | null): string {
  return imagem
    ? `<img class="fb-foto" src="${esc(imagem)}" width="${FOTO}" height="${FOTO}" alt="" ` +
        `style="display:block;width:${FOTO}px;height:${FOTO}px;border:2px solid ${COR.tinta};` +
        `background:${COR.cinza};object-fit:cover;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td width="${FOTO}" height="${FOTO}" bgcolor="${COR.cinza}" style="width:${FOTO}px;` +
        `height:${FOTO}px;background:${COR.cinza};border:2px solid ${COR.tinta};font-size:1px;` +
        `line-height:1px;">&nbsp;</td></tr></table>`
}

/** Uma linha de produto: a foto, o nome, o preço e o link "Ver". */
function linhaDoProduto(p: ProdutoDoCrm, href: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="${FOTO + 16}" valign="middle" style="width:${FOTO + 16}px;">` +
    `<a href="${esc(href)}" target="_blank" style="text-decoration:none;">${foto(p.imagem)}</a></td>` +
    `<td valign="middle" style="font-family:${FONTE};">` +
    paragrafo(esc(p.nome), { tamanho: 15, peso: 700 }) +
    espaco(2) +
    preco(p) +
    espaco(4) +
    paragrafo(
      `<a href="${esc(href)}" target="_blank" class="fb-texto" style="color:${COR.tinta};` +
        `font-weight:800;text-decoration:underline;">Ver na loja</a>`,
      { tamanho: 13 }
    ) +
    `</td></tr></table>`
  )
}

/**
 * Um parágrafo que NÃO muda no modo escuro — o texto de cima de fundo
 * amarelo (o cupom, o selo). O `paragrafo` da moldura leva a classe que o
 * modo escuro clareia (`fb-texto`), e texto claro no amarelo some.
 */
function paragrafoNoAmarelo(
  html: string,
  {
    suave = false,
    tamanho = 15,
    peso = 400,
  }: { suave?: boolean; tamanho?: number; peso?: number } = {}
): string {
  return (
    `<p style="margin:0;font-family:${FONTE};font-size:${tamanho}px;` +
    `line-height:${Math.round(tamanho * 1.5)}px;font-weight:${peso};mso-line-height-rule:exactly;` +
    `color:${suave ? COR.tintaSuave : COR.tinta};">${html}</p>`
  )
}

/** A página do produto; sem o handle (item sem produto), a lista inteira. */
const caminhoDoProduto = (p: ProdutoDoCrm) =>
  p.handle ? `/produtos/${encodeURIComponent(p.handle)}` : "/produtos"

/** "★★★★☆" — as estrelas do depoimento, de 1 a 5. */
function estrelas(n = 5): string {
  const cheias = Math.max(1, Math.min(5, Math.round(n)))
  return "★".repeat(cheias) + "☆".repeat(5 - cheias)
}

/** Cada bloco, já dentro do seu cartão branco. */
function bloco(b: BlocoDoCrm, e: EmailDoCrm): string {
  switch (b.tipo) {
    case "texto":
      return cartao(paragrafo(esc(b.texto)), { respiro: "22px 28px" })
    case "produtos": {
      const linhas = b.produtos
        .slice(0, 3)
        .map((p) => linhaDoProduto(p, linkDoCrm(e.loja.url, caminhoDoProduto(p), e.campanha)))
      if (!linhas.length) return ""
      return cartao((b.titulo ? rotulo(b.titulo) + espaco(14) : "") + linhas.join(espaco(14)), {
        respiro: "24px 28px",
      })
    }
    case "cupom":
      return cartao(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center" bgcolor="${COR.amareloClaro}" style="background:${COR.amareloClaro};` +
          `border:2px dashed ${COR.tinta};padding:18px 16px;text-align:center;">` +
          paragrafoNoAmarelo(esc(b.oque), { tamanho: 14, peso: 700 }) +
          espaco(6) +
          `<p style="margin:0;font-family:${FONTE};font-size:26px;line-height:32px;` +
          `font-weight:800;letter-spacing:0.08em;color:${COR.tinta};">${esc(b.codigo)}</p>` +
          espaco(6) +
          paragrafoNoAmarelo(esc(b.validade), { suave: true, tamanho: 13 }) +
          `</td></tr></table>`,
        { respiro: "22px 28px" }
      )
    case "depoimento":
      return cartao(
        paragrafo(
          `<span class="fb-verde" style="color:${COR.mentaEscura};letter-spacing:0.1em;" aria-label="${esc(
            `${Math.max(1, Math.min(5, Math.round(b.estrelas ?? 5)))} de 5 estrelas`
          )}">${estrelas(b.estrelas)}</span>`,
          { tamanho: 18, peso: 800 }
        ) +
          espaco(8) +
          paragrafo(`“${esc(b.texto)}”`, { tamanho: 16, peso: 700 }) +
          espaco(6) +
          paragrafo(esc(b.quem), { suave: true, tamanho: 13 }),
        { respiro: "22px 28px" }
      )
    case "passos": {
      const passos = b.passos.slice(0, 4)
      if (!passos.length) return ""
      const largura = Math.floor(100 / passos.length)
      return cartao(
        (b.titulo ? rotulo(b.titulo) + espaco(14) : "") +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          passos
            .map(
              (p, i) =>
                `<td width="${largura}%" valign="top" style="width:${largura}%;padding:0 6px 0 0;">` +
                `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
                `<td width="30" height="30" align="center" bgcolor="${COR.tinta}" style="width:30px;` +
                `height:30px;background:${COR.tinta};color:${COR.amarelo};font-family:${FONTE};` +
                `font-size:15px;line-height:30px;font-weight:800;mso-line-height-rule:exactly;">` +
                `${i + 1}</td></tr></table>` +
                espaco(8) +
                paragrafo(esc(p), { tamanho: 14, peso: 700 }) +
                `</td>`
            )
            .join("") +
          `</tr></table>`,
        { respiro: "22px 28px" }
      )
    }
    case "pix":
      return cartao(
        rotulo("Pix copia e cola") +
          espaco(12) +
          (/^https:\/\//.test(b.imagem ?? "")
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
              `<td align="center"><img src="${esc(b.imagem)}" width="180" height="180" alt="QR code do Pix" ` +
              `style="display:block;width:180px;height:180px;border:0;"></td></tr></table>` +
              espaco(14)
            : "") +
          // Fundo claro e letra escura que não mudam no modo escuro: o código tem que ser lido.
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td bgcolor="${COR.cinza}" style="background:${COR.cinza};border:2px dashed ${COR.tinta};` +
          `padding:14px 16px;"><p style="margin:0;font-family:${FONTE};font-size:13px;line-height:19px;` +
          `word-break:break-all;color:${COR.tinta};">${esc(b.codigo)}</p></td></tr></table>` +
          espaco(10) +
          paragrafo(
            esc(`Vale até ${b.vence}. No app do banco: Pix, Pix copia e cola, e cole o código.`),
            { suave: true, tamanho: 13 }
          ),
        { respiro: "22px 28px" }
      )
    case "selo":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td align="center" bgcolor="${COR.amarelo}" style="background:${COR.amarelo};` +
        `border:2px solid ${COR.tinta};padding:12px 16px;text-align:center;">` +
        paragrafoNoAmarelo(esc(b.texto), { tamanho: 14, peso: 800 }) +
        `</td></tr></table>` +
        espaco(22)
      )
  }
}

/** O bloco de texto de cada bloco, na versão sem HTML. */
function blocoEmTexto(b: BlocoDoCrm, e: EmailDoCrm): string[] {
  switch (b.tipo) {
    case "texto":
      return [b.texto]
    case "produtos":
      return [
        ...(b.titulo ? [b.titulo.toUpperCase()] : []),
        ...b.produtos
          .slice(0, 3)
          .map(
            (p) =>
              `- ${p.nome}${p.preco !== null ? ` · ${emReais(p.preco)}` : ""}: ` +
              linkDoCrm(e.loja.url, caminhoDoProduto(p), e.campanha)
          ),
      ]
    case "cupom":
      return [`${b.oque}: ${b.codigo} (${b.validade})`]
    case "depoimento":
      return [`"${b.texto}" — ${b.quem}`]
    case "passos":
      return [
        ...(b.titulo ? [b.titulo.toUpperCase()] : []),
        b.passos
          .slice(0, 4)
          .map((p, i) => `${i + 1}. ${p}`)
          .join("  "),
      ]
    case "selo":
      return [b.texto]
    case "pix":
      return [`Pix copia e cola (vale até ${b.vence}):`, b.codigo]
  }
}

/** O WhatsApp da loja pro link (`wa.me/5547…`), ou null. */
const linkDoWhatsapp = (numero: string | null) =>
  numero && /^\d{10,15}$/.test(numero) ? `https://wa.me/${numero}` : null

/**
 * O E-MAIL DO CRM, pronto pro `enviarEmail`: o HTML, a versão em texto e os
 * cabeçalhos do sair da lista.
 */
export function emailDoCrm(e: EmailDoCrm): Email & { cabecalhos: Record<string, string> } {
  const oi = e.nome ? `Oi, ${e.nome}!` : "Oi!"
  const principal = e.botao ? linkDoCrm(e.loja.url, e.botao.caminho, e.campanha) : null
  const topo = cartao(
    paragrafo(esc(oi), { tamanho: 15, peso: 700 }) +
      espaco(10) +
      titulo(e.titulo) +
      espaco(12) +
      paragrafo(esc(e.texto)) +
      (principal && e.botao
        ? espaco(22) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="left">${botao({ texto: e.botao.texto, href: principal })}</td></tr></table>`
        : ""),
    { respiro: "30px 28px 30px" }
  )
  const whatsapp = linkDoWhatsapp(e.loja.whatsapp)
  const empresa = [e.loja.empresa, e.loja.cnpj ? `CNPJ ${e.loja.cnpj}` : null]
    .filter(Boolean)
    .join(" · ")
  const porque = e.porque ?? "Você recebeu porque aceitou receber ofertas da FuckingBarba."
  const html = moldura({
    assunto: e.assunto,
    previa: e.previa,
    conteudo: topo + e.blocos.map((b) => bloco(b, e)).join(""),
    rodape:
      `${esc(porque)} ` +
      `<a href="${esc(e.sair.pagina)}" target="_blank" class="fb-rodape" ` +
      `style="color:${COR.tinta};text-decoration:underline;font-weight:800;">` +
      `Sair da lista em 1 clique</a>. Os e-mails dos seus pedidos continuam chegando.` +
      (empresa ? `<br>${esc(empresa)}` : ""),
    links: [
      { texto: "Loja", href: linkDoCrm(e.loja.url, "/", e.campanha) },
      { texto: "Instagram", href: INSTAGRAM },
      { texto: "TikTok", href: TIKTOK },
      ...(whatsapp ? [{ texto: "WhatsApp", href: whatsapp }] : []),
    ],
  })
  const texto = [
    `FuckingBarba — ${e.titulo}`,
    "",
    oi,
    "",
    e.texto,
    ...(principal && e.botao ? ["", `${e.botao.texto}: ${principal}`] : []),
    ...e.blocos.flatMap((b) => ["", ...blocoEmTexto(b, e)]),
    "",
    porque,
    `Sair da lista: ${e.sair.pagina}`,
    ...(empresa ? [empresa] : []),
    `Instagram: ${INSTAGRAM} · TikTok: ${TIKTOK}${whatsapp ? ` · WhatsApp: ${whatsapp}` : ""}`,
  ].join("\n")
  const cabecalhos: Record<string, string> = e.sair.umClique
    ? {
        "List-Unsubscribe": `<${e.sair.umClique}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : { "List-Unsubscribe": `<${e.sair.pagina}>` }
  return { para: e.para, assunto: e.assunto, html, texto, cabecalhos }
}

/* ── os exemplos do painel (CRM → E-mails) ─────────────────────────────── */

export type IdDoExemplo = "boas-vindas" | "reposicao" | "carrinho"

export type ExemploDoCrm = { id: IdDoExemplo; nome: string; email: EmailDoCrm }

/** Os produtos dos exemplos, pelo endereço — os três que o protótipo mostrava. */
export const PRODUTOS_DOS_EXEMPLOS = [
  "kit-completo-para-barba",
  "fator-de-crescimento-para-barba",
  "oleo-para-barba",
] as const

const COMO_COMPRAR = ["Pix aprovado na hora", "Cartão em até 3x sem juros", "Rastreio por e-mail"]

/**
 * OS TRÊS EXEMPLOS DO MODELO, com os produtos de verdade da loja: as
 * boas-vindas, a hora de repor e o carrinho. É o que o painel mostra e o que
 * o "Mandar pra mim" manda — os fluxos que mandam sozinhos vêm depois, com
 * o texto de cada um. O cupom e o depoimento dizem que são exemplo.
 */
export function exemplosDoCrm(base: {
  para: string
  nome: string | null
  sair: EmailDoCrm["sair"]
  loja: EmailDoCrm["loja"]
  produtos: Map<string, ProdutoDoCrm>
  /** "05/10": quando o Fator do exemplo acaba. */
  acabaEm: string
}): ExemploDoCrm[] {
  const produto = (handle: string) => base.produtos.get(handle)
  const lista = (...handles: string[]) =>
    handles.map(produto).filter((p): p is ProdutoDoCrm => Boolean(p))
  const kit = produto("kit-completo-para-barba")
  const fator = produto("fator-de-crescimento-para-barba")
  const comum = { para: base.para, nome: base.nome, sair: base.sair, loja: base.loja }
  return [
    {
      id: "boas-vindas",
      nome: "Boas-vindas",
      email: {
        ...comum,
        campanha: "boas-vindas",
        assunto: "Bem-vindo à FuckingBarba",
        previa: "Os mais pedidos da loja e um presente pra primeira compra.",
        titulo: "Bem-vindo à FuckingBarba",
        texto:
          "Aqui é barba e cabelo levados a sério: fórmulas de alta performance, sem enrolação. " +
          "Pra começar bem, separamos os mais pedidos da loja — e um presente pra sua primeira compra.",
        botao: { texto: "Conhecer a loja", caminho: "/produtos" },
        blocos: [
          {
            tipo: "cupom",
            codigo: "EXEMPLO10",
            oque: "Exemplo do cupom da primeira compra",
            validade: "O cupom de verdade é o que o fluxo de boas-vindas der",
          },
          {
            tipo: "produtos",
            titulo: "Os mais pedidos",
            produtos: lista(...PRODUTOS_DOS_EXEMPLOS),
          },
          {
            tipo: "depoimento",
            texto: "Aqui entra uma avaliação de verdade, das aprovadas no painel.",
            quem: "Exemplo de depoimento",
            estrelas: 5,
          },
        ],
      },
    },
    {
      id: "reposicao",
      nome: "Hora de repor",
      email: {
        ...comum,
        campanha: "reposicao",
        assunto: `O seu ${fator?.nome ?? "Fator de Crescimento"} está acabando`,
        previa: `Pelo seu último pedido, ele acaba por volta de ${base.acabaEm}.`,
        titulo: "Hora de repor",
        texto:
          `Pelo seu último pedido, o seu ${fator?.nome ?? "Fator de Crescimento"} acaba por volta ` +
          `de ${base.acabaEm}. Pra não parar o tratamento no meio, dá pra garantir o próximo agora.`,
        botao: {
          texto: "Comprar de novo",
          caminho: `/produtos/${fator?.handle ?? "fator-de-crescimento-para-barba"}`,
        },
        blocos: [
          { tipo: "produtos", produtos: lista("fator-de-crescimento-para-barba") },
          { tipo: "selo", texto: COMO_COMPRAR.slice(0, 2).join(" · ") },
        ],
      },
    },
    {
      id: "carrinho",
      nome: "Carrinho",
      email: {
        ...comum,
        campanha: "carrinho",
        assunto: "Ficou na sua sacola",
        previa: `${kit?.nome ?? "O seu produto"} está te esperando.`,
        titulo: "Esqueceu alguma coisa?",
        texto:
          `Você deixou ${kit ? `o ${kit.nome}` : "um produto"} na sacola. Ele ainda está lá — ` +
          "é só voltar e terminar.",
        // Nos e-mails de verdade, o botão é o link de voltar (`lib/crm/voltar.ts`), que põe o
        // carrinho da pessoa de volta; no exemplo, o checkout de quem abrir.
        botao: { texto: "Voltar pra sacola", caminho: "/checkout" },
        blocos: [
          { tipo: "produtos", produtos: lista("kit-completo-para-barba") },
          { tipo: "passos", titulo: "Como fica", passos: COMO_COMPRAR },
        ],
      },
    },
  ]
}
