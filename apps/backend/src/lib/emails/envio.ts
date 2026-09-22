import type { Email } from "../email"
import type { MomentoDoAviso } from "../envios/situacao"
import {
  botao,
  cartao,
  comSombra,
  COR,
  divisor,
  esc,
  espaco,
  FONTE,
  moldura,
  paragrafo,
  rotulo,
  titulo,
  trilha,
  urlDaLoja,
} from "./moldura"
import { PASSOS_DO_PEDIDO, whatsappNaTela, type PedidoDoEmail } from "./pedido-confirmado"

/**
 * OS E-MAILS DO CAMINHO DA ENCOMENDA — um desenho, quatro momentos:
 *
 *   enviado   saiu da loja, com o código de rastreio (o que a tela de
 *             obrigado e o e-mail de confirmação prometem);
 *   saiu      saiu pra entrega: precisa ter alguém em casa;
 *   retirar   esperando na agência, com prazo pra voltar pra loja;
 *   entregue  chegou — e o caminho das trocas.
 *
 * Quem decide QUAL sai, e que sai uma vez só, é o núcleo dos envios
 * (`lib/envios/situacao.ts`, `avisoPendente`); isto aqui só desenha. Não
 * sabe de parceiro nenhum: recebe o código, o link e a transportadora como
 * o núcleo guardou.
 *
 * O CÓDIGO VAI NUMA CAIXA, como o do e-mail de acesso: é a coisa que a
 * pessoa vai copiar. O link da transportadora vai embaixo, e só quando é
 * `http(s)` — ele vem do parceiro, e e-mail com a nossa marca não carrega
 * link que ninguém conferiu.
 */

export type PedidoDoAviso = {
  id: string
  numero: number
  email: string
  itens: { nome: string; variante: string | null; quantidade: number }[]
  entrega: PedidoDoEmail["entrega"]
}

export type EnvioDoAviso = {
  codigo: string
  url: string | null
  transportadora: string | null
  servico: string | null
}

const INSTAGRAM = "https://www.instagram.com/fuckingbarba"

/** "com os Correios" — a única transportadora que o núcleo reconhece pelo código. */
const comQuem = (t: string | null) =>
  t === "Correios" ? "com os Correios" : "com a transportadora"

type Texto = {
  assunto: (numero: string) => string
  titulo: string
  frase: (envio: EnvioDoAviso) => string
  previa: (envio: EnvioDoAviso) => string
  icone: "caminhao.png" | "confirmado.png"
  /** Quantos passos da trilha já aconteceram. */
  feitos: number
  descricaoDaTrilha: string
  botao: string
}

const TEXTOS: Record<MomentoDoAviso, Texto> = {
  enviado: {
    assunto: (n) => `Pedido ${n} a caminho`,
    titulo: "Pedido a caminho",
    frase: (e) =>
      `Sua encomenda saiu daqui e já está ${comQuem(e.transportadora)}. ` +
      "É só acompanhar pelo código aí embaixo.",
    previa: (e) => `Código de rastreio: ${e.codigo}.`,
    icone: "caminhao.png",
    feitos: 3,
    descricaoDaTrilha: "Pedido feito, pagamento aprovado e enviado; falta entregar.",
    botao: "Acompanhar pedido",
  },
  saiu: {
    assunto: (n) => `Pedido ${n} saiu pra entrega`,
    titulo: "Chega hoje",
    frase: () => "Sua encomenda saiu pra entrega. Precisa ter alguém no endereço pra receber.",
    previa: () => "Precisa ter alguém no endereço pra receber.",
    icone: "caminhao.png",
    feitos: 3,
    descricaoDaTrilha: "Pedido feito, pagamento aprovado e enviado; saiu pra entrega.",
    botao: "Acompanhar pedido",
  },
  retirar: {
    assunto: (n) => `Pedido ${n} esperando retirada`,
    titulo: "Pronto pra retirar",
    frase: () =>
      "Não deu pra entregar no endereço, e a encomenda está esperando você na agência. " +
      "Ela fica lá só por poucos dias antes de voltar pra loja.",
    previa: () => "A encomenda está esperando você na agência.",
    icone: "caminhao.png",
    feitos: 3,
    descricaoDaTrilha: "Pedido feito, pagamento aprovado e enviado; esperando retirada.",
    botao: "Ver o pedido",
  },
  entregue: {
    assunto: (n) => `Pedido ${n} entregue`,
    titulo: "Chegou!",
    frase: () =>
      "Sua encomenda foi entregue. Aproveita — e, se alguma coisa não estiver certa, chama a gente.",
    previa: () => "Sua encomenda foi entregue.",
    icone: "confirmado.png",
    feitos: 4,
    descricaoDaTrilha: "Pedido feito, pago, enviado e entregue.",
    botao: "Ver o pedido",
  },
}

/** Só link de verdade — o texto vem do parceiro, e `javascript:` também é texto. */
function linkSeguro(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

/** "Correios · PAC" — o que se sabe de quem leva. */
function quemLeva(e: EnvioDoAviso): string {
  return [e.transportadora, e.servico].filter(Boolean).join(" · ")
}

function caixaDoCodigo(envio: EnvioDoAviso, link: string | null): string {
  const quem = quemLeva(envio)
  const caixa = comSombra({
    celula:
      `<td class="fb-cartao" align="left" bgcolor="${COR.amareloClaro}" style="background:${COR.amareloClaro};` +
      `border:2px solid ${COR.tinta};padding:14px 18px;">` +
      `<p class="fb-suave" style="margin:0;font-family:${FONTE};font-size:11px;line-height:14px;font-weight:800;` +
      `letter-spacing:0.08em;text-transform:uppercase;color:${COR.tintaSuave};mso-line-height-rule:exactly;">` +
      `Rastreio${quem ? ` · ${esc(quem)}` : ""}</p>` +
      `<p class="fb-texto" style="margin:4px 0 0;font-family:${FONTE};font-size:22px;line-height:28px;` +
      `font-weight:800;letter-spacing:2px;color:${COR.tinta};mso-line-height-rule:exactly;` +
      `font-variant-numeric:tabular-nums;word-break:break-all;">${esc(envio.codigo)}</p>` +
      `</td>`,
    cor: COR.tinta,
    tamanho: 4,
    fundo: COR.papel,
    largura: "100%",
    classeDaSombra: "fb-sombra",
    classeDoDente: "fb-dente",
  })
  return (
    caixa +
    (link
      ? espaco(12) +
        paragrafo(
          `<a href="${esc(link)}" target="_blank" class="fb-texto" style="color:${COR.tinta};` +
            `font-weight:700;text-decoration:underline;">Rastrear na transportadora ↗</a>`,
          { tamanho: 14 }
        )
      : "")
  )
}

export function emailDoEnvio({
  momento,
  pedido,
  envio,
  whatsapp,
}: {
  momento: MomentoDoAviso
  pedido: PedidoDoAviso
  envio: EnvioDoAviso
  /** Só dígitos, com DDI — o das configurações da loja. */
  whatsapp: string | null
}): Email {
  const t = TEXTOS[momento]
  const numero = `#${pedido.numero}`
  const assunto = t.assunto(numero)
  const frase = t.frase(envio)
  const loja = urlDaLoja()
  const link = linkSeguro(envio.url)
  const doPedido = loja ? `${loja}/conta/pedidos/${encodeURIComponent(pedido.id)}` : null

  /* 1. o que aconteceu, o código e o botão */
  const topo = cartao(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="center" style="text-align:center;">` +
      (loja
        ? `<img src="${esc(loja)}/email/${t.icone}" width="48" height="48" alt="" ` +
          `style="display:block;margin:0 auto 14px;border:0;width:48px;height:48px;">`
        : "") +
      titulo(t.titulo) +
      espaco(10) +
      paragrafo(
        `Pedido <span style="background:${COR.amarelo};color:${COR.tinta};font-weight:800;` +
          `padding:2px 7px;white-space:nowrap;">${esc(numero)}</span>`,
        { tamanho: 15 }
      ) +
      espaco(6) +
      paragrafo(esc(frase), { suave: true, tamanho: 14 }) +
      `</td></tr></table>` +
      espaco(22) +
      caixaDoCodigo(envio, link) +
      espaco(24) +
      trilha({ passos: PASSOS_DO_PEDIDO, feitos: t.feitos, descricao: t.descricaoDaTrilha }) +
      (doPedido
        ? espaco(26) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center">${botao({ texto: t.botao, href: doPedido })}</td></tr></table>`
        : ""),
    { respiro: "32px 28px 30px" }
  )

  /* 2. o que vai na caixa, e pra onde (ou onde buscar) */
  const itens = pedido.itens
    .map(
      (i) =>
        `<b>${esc(i.quantidade)}×</b> ${esc(i.nome)}` +
        (i.variante
          ? ` <span class="fb-suave" style="color:${COR.tintaSuave};">· ${esc(i.variante)}</span>`
          : "")
    )
    .join("<br>")
  const e = pedido.entrega
  const endereco = e
    ? [e.nome, e.linha1, e.linha2, `${e.cidade}/${e.uf} · ${e.cep}`]
        .filter(Boolean)
        .map(esc)
        .join("<br>")
    : ""
  const ajuda = whatsapp
    ? `Algum problema com a entrega? Chama no WhatsApp <a href="https://wa.me/${esc(whatsapp)}" target="_blank" ` +
      `style="color:${COR.tinta};font-weight:700;text-decoration:underline;white-space:nowrap;" class="fb-texto">` +
      `${esc(whatsappNaTela(whatsapp))}</a> com o número <b>${esc(numero)}</b>.`
    : `Guarde o número <b>${esc(numero)}</b>: é por ele que a gente encontra seu pedido.`

  let meio = ""
  if (itens)
    meio +=
      rotulo(momento === "entregue" ? "O que chegou" : "O que vai na caixa") +
      espaco(10) +
      paragrafo(itens, { tamanho: 14 })
  if (momento === "retirar") {
    meio +=
      (meio ? espaco(20) + divisor() + espaco(20) : "") +
      rotulo("Onde retirar") +
      espaco(10) +
      paragrafo("Na agência que o rastreio indica, com um documento com foto de quem vai buscar.", {
        tamanho: 14,
      })
  } else if (momento === "entregue") {
    meio +=
      (meio ? espaco(20) + divisor() + espaco(20) : "") +
      rotulo("Trocas") +
      espaco(10) +
      paragrafo(
        "Quer trocar ou devolver? São 7 dias pra desistir, por lei" +
          (loja
            ? ` — <a href="${esc(loja)}/trocas" target="_blank" class="fb-texto" style="color:${COR.tinta};` +
              `font-weight:700;text-decoration:underline;">veja como funciona</a>.`
            : "."),
        { tamanho: 14 }
      )
  } else if (endereco) {
    meio +=
      (meio ? espaco(20) + divisor() + espaco(20) : "") +
      rotulo("Pra onde vai") +
      espaco(10) +
      paragrafo(endereco, { tamanho: 14 })
  }
  meio += (meio ? espaco(20) : "") + paragrafo(ajuda, { suave: true, tamanho: 13 })
  const depois = cartao(meio)

  const html = moldura({
    assunto,
    previa: t.previa(envio),
    conteudo: topo + depois,
    rodape: `Você recebeu porque fez o pedido ${esc(numero)} na FuckingBarba.`,
    links: loja
      ? [
          { texto: "Loja", href: loja },
          { texto: "Instagram", href: INSTAGRAM },
        ]
      : [{ texto: "Instagram", href: INSTAGRAM }],
  })

  const quem = quemLeva(envio)
  const texto = [
    `FuckingBarba — pedido ${numero}: ${t.titulo.toLowerCase()}`,
    "",
    frase,
    "",
    `Rastreio${quem ? ` (${quem})` : ""}: ${envio.codigo}`,
    ...(link ? [`Rastrear na transportadora: ${link}`] : []),
    ...(pedido.itens.length
      ? [
          "",
          momento === "entregue" ? "O QUE CHEGOU" : "O QUE VAI NA CAIXA",
          ...pedido.itens.map(
            (i) => `- ${i.quantidade}× ${i.nome}${i.variante ? ` (${i.variante})` : ""}`
          ),
        ]
      : []),
    ...(momento === "retirar"
      ? [
          "",
          "ONDE RETIRAR",
          "Na agência que o rastreio indica, com um documento com foto de quem vai buscar.",
        ]
      : momento === "entregue"
        ? [
            "",
            "TROCAS",
            `Quer trocar ou devolver? São 7 dias pra desistir, por lei${loja ? ` — ${loja}/trocas` : "."}`,
          ]
        : e
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
    whatsapp
      ? `Algum problema com a entrega? Chama no WhatsApp ${whatsappNaTela(whatsapp)} com o número ${numero}.`
      : `Guarde o número ${numero}: é por ele que a gente encontra seu pedido.`,
    ...(doPedido ? ["", `Acompanhar o pedido: ${doPedido}`] : []),
  ].join("\n")

  return { para: pedido.email, assunto, html, texto }
}
