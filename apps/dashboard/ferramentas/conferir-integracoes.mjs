/**
 * CONFERIDOR DAS INTEGRAÇÕES — o dono põe o código do GA4, do Google Ads, da
 * Meta, da Clarity e do TikTok no painel (Configurações → Integrações); a
 * loja liga todas na primeira página, antes da resposta da faixa de cookies,
 * como a Nuvemshop (0230) — a faixa tem um botão só, "Entendi", e quem não
 * quer recusa na política de privacidade —; e a compra sai do servidor
 * quando o pagamento entra, pra todas, de quem não recusou.
 *
 *   (Medusa local apontando pros falsos; painel e loja no ar)
 *   node apps/dashboard/ferramentas/conferir-integracoes.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL), REVALIDAR_SEGREDO (a assinatura
 * da loja, pra rota do rastro), LOJA, PORTA_PAGARME_FALSO, PORTA_FALSA e
 * PORTA_ANUNCIOS. O Medusa sobe com as chaves de teste e os endereços do
 * falso dos anúncios (`apps/loja/ferramentas/anuncios-falsos.mjs`).
 *
 * NENHUM SCRIPT DE VERDADE CARREGA: o navegador troca o gtag.js, o
 * fbevents.js, o do TikTok e o da Clarity por um de mentira, e as chamadas
 * ficam nas filas de cada um (`dataLayer`, `fbq.queue`, `ttq`, `clarity.q`),
 * que é onde o conferidor lê.
 *
 * DESFAZ O QUE MUDOU, mesmo quando falha: as configurações voltam ao que
 * eram (sem integração, as outras rodadas não veem a faixa), e o membro da
 * rodada sai da equipe.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • código fora do formato gravado (e dentro de uma tag); o trecho       │
 * │   colado que não vira o código; a tela do admin apagando os códigos;   │
 * │ • uma tag que não liga na primeira página, antes da resposta, ou liga  │
 * │   sem o consentimento do Google todo liberado (o da Nuvemshop); a      │
 * │   faixa com mais de um botão, ou o "Entendi" carregando tudo de novo;  │
 * │ • a recusa da política de privacidade deixando script ou cookie de     │
 * │   parceiro na página, ou deixando de valer na página seguinte;         │
 * │ • a resposta de antes (a v1, ou sem um parceiro novo) valendo sem a    │
 * │   faixa aparecer de novo;                                              │
 * │ • a faixa embaixo da barra de compra da PDP (25/09: o botão sumia      │
 * │   atrás dela no celular), ou cobrindo o botão da barra do checkout; a  │
 * │   faixa grande no celular;                                             │
 * │ • o produto, a sacola e a compra que não chegam em cada plataforma —   │
 * │   inclusive de quem nunca clicou no "Entendi";                         │
 * │ • a campanha do link (UTMs, gclid, fbclid) que os parceiros não leem   │
 * │   na chegada, ou que volta repetida;                                   │
 * │ • a compra de quem recusou saindo pelo servidor; a de quem não         │
 * │   respondeu sem ir pra todas; a recusa da plataforma sem virar         │
 * │   problema na Observabilidade;                                         │
 * │ • o rastro aceito sem a assinatura da loja.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createHash } from "node:crypto"
import { subirAnunciosFalsos } from "../../loja/ferramentas/anuncios-falsos.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import {
  abrirNavegador,
  avisoDoClique,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  hidratado,
  medusa,
  MEDUSA,
  ok,
  PAINEL,
  resumo,
  RODADA,
  subirResend,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const SEGREDO = process.env.REVALIDAR_SEGREDO ?? ""
if (!CHAVE || !SEGREDO || !process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
  console.log(
    "  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, REVALIDAR_SEGREDO, ADMIN_EMAIL e ADMIN_SENHA"
  )
  process.exit(1)
}
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
const OP = `op.${RODADA}@painel.teste`
const sha256 = (s) => createHash("sha256").update(s).digest("hex")
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

const CODIGOS = {
  ga4: "G-TESTE12345",
  googleAds: "AW-123456789",
  googleAdsCompra: "AbC-D_efG-h12",
  metaPixel: "123456789012345",
  clarity: "abcde12345",
  tiktok: "C4ABCDEFGH1234567890",
}

/* ── os falsos, o admin ───────────────────────────────────────────────────── */

const resend = await subirResend()
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "",
  },
})
const anuncios = await subirAnunciosFalsos()
console.log(
  `  ⚙  Resend :${resend.porta} · Pagar.me :${pagarme.porta} · anúncios :${anuncios.porta} · painel ${PAINEL} · loja ${LOJA}`
)
const caixa = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()

const tokenAdmin = (
  await (
    await fetch(`${MEDUSA}/auth/user/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_SENHA }),
    })
  ).json()
).token
async function adm(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })
const publicas = async () =>
  (
    await (
      await fetch(`${MEDUSA}/store/configuracoes`, { headers: { "x-publishable-api-key": CHAVE } })
    ).json()
  ).configuracoes

/** A rota do rastro, como a loja chama (assinada) — ou sem a assinatura. */
async function rastro(pedido, corpo, { assinado = true } = {}) {
  const r = await fetch(`${MEDUSA}/store/pedidos/rastro`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(assinado ? { "x-loja-segredo": SEGREDO } : {}),
    },
    body: JSON.stringify({ pedido, rastro: corpo }),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

const rastroComSim = {
  em: new Date().toISOString(),
  consentimento: "sim",
  parceiros: ["google", "meta", "tiktok", "clarity"],
  ga: { cookie: "GA1.1.123456789.1790000000", sessao: "GS2.1.s1790000123$o1$g0$t1790000123" },
  meta: { fbp: "fb.1.1790000000000.987654321", fbc: null },
  tiktok: { ttp: "ttp-do-conferidor.1" },
  ip: "200.1.2.3",
  navegador: "Conferidor/1.0",
  pagina: `${LOJA}/checkout`,
}

/* ── a loja, com os scripts de terceiro trocados ─────────────────────────── */

/**
 * O script de mentira de cada um anota que carregou e o endereço da página
 * nessa hora: é dali que o de verdade lê a campanha (o `?utm_…`, o `gclid`).
 */
const deMentira = (nome) =>
  `window.__carregou = (window.__carregou || []).concat('${nome}');` +
  ` (window.__endereco = window.__endereco || {})['${nome}'] = location.href`
/**
 * O da Meta faz também o que o fbevents.js de verdade faz ao chegar: o
 * `fbq.callMethod`. Sem ele, a loja acha que um bloqueador trocou o script
 * por um vazio, e a visita passa a ir pelo servidor (0231).
 */
const daMetaDeMentira =
  deMentira("meta") +
  "; if (window.fbq) window.fbq.callMethod = function () { window.fbq.queue.push(arguments) }"
const TERCEIROS = [
  ["googletagmanager.com", deMentira("google")],
  ["connect.facebook.net", daMetaDeMentira],
  ["analytics.tiktok.com", deMentira("tiktok")],
  ["clarity.ms", deMentira("clarity")],
]

const RASTREADORES =
  /(googletagmanager\.com|google-analytics\.com|doubleclick\.net|facebook\.(net|com)|tiktok\.com|clarity\.ms|bing\.com)$/

/**
 * Uma visita à loja: os scripts de fora trocados por um de mentira, e anotados.
 * `bloquear`: os hosts que o navegador recusa, como um bloqueador de anúncio.
 */
async function visitaNaLoja(cookies = [], tela = {}, { bloquear = [] } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, ...tela })
  const pedidos = []
  await contexto.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (rota) => {
    const url = rota.request().url()
    const host = new URL(url).hostname
    const terceiro = TERCEIROS.find(([h]) => host.endsWith(h))
    // Só o que é de medição e anúncio conta; o resto de fora (uma foto) só não sai.
    if (RASTREADORES.test(host)) pedidos.push(url)
    if (bloquear.some((h) => host.endsWith(h))) return rota.abort("blockedbyclient")
    if (terceiro)
      return rota.fulfill({ status: 200, contentType: "text/javascript", body: terceiro[1] })
    return rota.abort()
  })
  // O pop-up da 1ª compra já respondido: ele cobriria a página que o conferidor olha.
  await contexto.addCookies(
    [...cookies, { name: "fb_popup", value: "cadastrado" }].map((c) => ({ ...c, url: LOJA }))
  )
  const pagina = await contexto.newPage()
  pagina.on("pageerror", (e) => errosDeConsole.push(`${pagina.url()}: ${e.message}`))
  return { contexto, pagina, pedidos }
}

/** O que cada parceiro recebeu na página: as filas dos trechos oficiais. */
const filas = (pagina) =>
  pagina.evaluate(() => {
    const lista = (v) => (v ? Array.from(v, (x) => (Array.isArray(x) ? x : Array.from(x))) : [])
    return {
      carregou: window.__carregou ?? [],
      google: lista(window.dataLayer),
      meta: lista(window.fbq?.queue),
      tiktok: Array.isArray(window.ttq) ? window.ttq.map((x) => [...x]) : [],
      tiktokPixels: Object.keys(window.ttq?._i ?? {}),
      clarity: lista(window.clarity?.q),
      tags: [...document.querySelectorAll("script[src]")]
        .map((s) => s.src)
        .filter((s) => !s.startsWith(location.origin)),
    }
  })

/** Os passos da visita que chegaram pelo servidor (0231), do índice `desde` em diante. */
const passosDesde = (desde) =>
  anuncios.recebidos
    .slice(desde)
    .flatMap((r) =>
      (r.corpo?.data ?? []).map((d) => ({
        plataforma: r.plataforma,
        nome: d.event_name ?? d.event,
        id: d.event_id,
        pagina: d.event_source_url ?? d.page?.url ?? null,
        usuario: d.user_data ?? d.user ?? {},
      }))
    )
    .filter((p) => p.nome !== "Purchase")
async function esperarPassos(desde, condicao, ms = 20000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    if (condicao(passosDesde(desde))) break
    await esperar(300)
  }
  return passosDesde(desde)
}

const temChamada = (fila, ...partes) =>
  fila.some((c) => partes.every((p, i) => JSON.stringify(c[i]) === JSON.stringify(p)))

/** As quatro tags no ar (o de mentira anota quando carrega). */
const tagsNoAr = (pagina) =>
  pagina.waitForFunction(
    () =>
      ["google", "meta", "tiktok", "clarity"].every((p) => (window.__carregou ?? []).includes(p)),
    null,
    { timeout: 20000 }
  )

/** Cada uma das quatro carregou uma vez só. */
const umaVezCada = (fila) => [...fila.carregou].sort().join() === "clarity,google,meta,tiktok"

/** A primeira página, sem resposta ou com o sim: todas ligam, como na Nuvemshop (0230). */
const todasLigadas = (fila) =>
  umaVezCada(fila) &&
  temChamada(fila.google, "consent", "default", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    analytics_storage: "granted",
  }) &&
  temChamada(fila.google, "config", CODIGOS.ga4) &&
  temChamada(fila.google, "config", CODIGOS.googleAds) &&
  temChamada(fila.meta, "init", CODIGOS.metaPixel) &&
  temChamada(fila.meta, "track", "PageView") &&
  fila.tiktokPixels.includes(CODIGOS.tiktok) &&
  temChamada(fila.clarity, "consentv2", { ad_Storage: "granted", analytics_Storage: "granted" })

const valorDoCookie = async (contexto) =>
  (await contexto.cookies(LOJA)).find((c) => c.name === "fb_consentimento")?.value ?? null

// O que estava antes da rodada: volta no fim.
const { configuracoes: antes } = (await adm("/admin/configuracoes")).corpo
let tokenDoDono = ""

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Operação Teste", email: OP, papel: "operacao" },
  })
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, OP, caixa)
  const gravarOp = await medusa("/dashboard/configuracoes/integracoes", {
    token: cookieOp?.value,
    corpo: CODIGOS,
  })
  ok(gravarOp.status === 403, "a operação não grava as integrações", String(gravarOp.status))

  /* ── os códigos ───────────────────────────────────────────────────────── */

  titulo("Os códigos (API)")
  const gravar = (corpo) =>
    medusa("/dashboard/configuracoes/integracoes", { token: tokenDoDono, corpo })
  const errado = await gravar({
    ga4: "UA-1234-1",
    metaPixel: "12345",
    clarity: "</script><script>",
    tiktok: "TiktokAnalyticsObject",
    googleAdsCompra: "AbC-D_efG-h12",
  })
  ok(
    errado.status === 422 &&
      ["ga4", "metaPixel", "clarity", "tiktok", "googleAds"].every((c) => errado.corpo.erros?.[c]),
    "fora do formato: 422, campo a campo (e o rótulo sem a conta do Google Ads)",
    `${errado.status} ${JSON.stringify(errado.corpo.erros)}`
  )
  const colado = await gravar({
    ga4: `<script async src="https://www.googletagmanager.com/gtag/js?id=g-teste12345"></script>`,
    googleAds: " aw-123456789 ",
    googleAdsCompra: "gtag('event', 'conversion', {'send_to': 'AW-123456789/AbC-D_efG-h12'});",
    metaPixel: "fbq('init', '123456789012345');",
    clarity: `(function(c,l,a,r,i,t,y){})(window, document, "clarity", "script", "ABCDE12345");`,
    tiktok: "ttq.load('c4abcdefgh1234567890'); ttq.page();",
  })
  const p1 = await publicas()
  ok(
    colado.status === 200 && JSON.stringify(p1.integracoes) === JSON.stringify(CODIGOS),
    "o trecho colado vira o código, na caixa certa, e a rota pública da loja entrega",
    JSON.stringify(p1.integracoes)
  )
  // O "Salvar" da tela de configurações do admin manda só o que ela conhece.
  await adm("/admin/configuracoes", { metodo: "POST", corpo: { frete: p1.frete } })
  ok(
    JSON.stringify((await publicas()).integracoes) === JSON.stringify(CODIGOS),
    "a tela de configurações do admin não apaga os códigos (grava só o que mandou)"
  )
  const tela = (await medusa("/dashboard/configuracoes", { metodo: "GET", token: tokenDoDono }))
    .corpo
  const compra = tela.integracoes?.compra ?? []
  ok(
    compra.length === 4 &&
      compra.every((l) => l.ligado === true) &&
      tela.integracoes?.campos?.length === 6,
    "a compra de cada plataforma: com o código e a chave de teste, as quatro ligadas",
    JSON.stringify(compra.map((l) => [l.titulo, l.ligado]))
  )

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/configuracoes/integracoes`)
  await hidratado(pagina, '[data-form="integracoes"] [data-campo="tiktok"]')
  ok(
    (await pagina.locator('[data-campo="metaPixel"]').inputValue()) === CODIGOS.metaPixel &&
      (await pagina.locator('.abas a[aria-current="page"]').textContent()) === "Integrações" &&
      (await pagina.locator('[data-linhas="compra"] .linha').count()) === 4,
    "a aba Integrações: os códigos gravados, e a compra de cada plataforma"
  )
  await pagina.locator('[data-campo="tiktok"]').fill("ttq.load('c4zzzzzzzz1234567890');")
  // O aviso é lido quando entra: o campo refeito pode chegar depois de ele sumir (6 s).
  const salvas = await avisoDoClique(pagina, () =>
    pagina.locator('[data-form="integracoes"] button[type="submit"]').click()
  )
  await pagina.waitForFunction(
    () => document.querySelector('[data-campo="tiktok"]')?.value === "C4ZZZZZZZZ1234567890",
    null,
    { timeout: 10000 }
  )
  ok(
    /^Integrações salvas\./.test(salvas) &&
      (await publicas()).integracoes.tiktok === "C4ZZZZZZZZ1234567890",
    "pela tela: o trecho colado vira o código no campo, e grava",
    salvas
  )
  await gravar(CODIGOS)

  /* ── a loja ───────────────────────────────────────────────────────────── */

  titulo("A loja: todas as tags na primeira página, antes da resposta")
  // Os cookies que as tags de verdade gravam (as de mentira não gravam nada): a recusa apaga.
  const DOS_PARCEIROS = [
    { name: "_ga", value: "GA1.1.111111111.1790000000" },
    { name: `_ga_${CODIGOS.ga4.slice(2)}`, value: "GS2.1.s1790000000$o1$g0$t1790000000" },
    { name: "_gcl_au", value: "1.1.111111111.1790000000" },
    { name: "_fbp", value: "fb.1.1790000000000.111111111" },
    { name: "_ttp", value: "ttp-de-mentira.1" },
    { name: "_clck", value: "abc123%7C2%7Cfq0%7C0%7C1" },
    { name: "_clsk", value: "xyz789%7C1790000000000%7C1%7C1%7Cd.clarity.ms%2Fcollect" },
  ]
  const semResposta = await visitaNaLoja(DOS_PARCEIROS)
  await semResposta.pagina.goto(`${LOJA}/`)
  const faixa = semResposta.pagina.locator("[data-faixa-de-cookies]")
  await faixa.waitFor({ timeout: 20000 })
  const botoesDaFaixa = await faixa.getByRole("button").allTextContents()
  ok(
    semEspaco(await faixa.textContent()).startsWith(
      "Ao navegar por este site você aceita o uso de cookies para agilizar a sua experiência de compra."
    ) &&
      botoesDaFaixa.length === 1 &&
      semEspaco(botoesDaFaixa[0]) === "Entendi",
    "a faixa da Nuvemshop: o texto de lá (0172) e um botão só, “Entendi” (0230)",
    `${semEspaco(await faixa.textContent())} · botões: ${botoesDaFaixa.join(" | ")}`
  )
  await tagsNoAr(semResposta.pagina)
  await esperar(1000)
  const naChegadaSemResposta = await filas(semResposta.pagina)
  ok(
    todasLigadas(naChegadaSemResposta),
    "sem responder: o GA4, o Google Ads, a Meta (com o PageView), o TikTok e a Clarity ligam na hora, com o consentimento do Google todo liberado",
    JSON.stringify({
      carregou: naChegadaSemResposta.carregou,
      padrao: naChegadaSemResposta.google.find((c) => c[0] === "consent"),
      tiktok: naChegadaSemResposta.tiktokPixels,
    })
  )

  titulo("O produto e a sacola, de quem nunca respondeu")
  const passosAntesDoProduto = anuncios.recebidos.length
  await semResposta.pagina.goto(`${LOJA}/produtos/shampoo-para-barba`)
  await hidratado(semResposta.pagina, ".compra__comprar")
  await semResposta.pagina.waitForFunction(
    () => Array.from(window.fbq?.queue ?? []).some((c) => c[1] === "ViewContent"),
    null,
    { timeout: 15000 }
  )
  await semResposta.pagina.locator(".compra__comprar").click()
  await semResposta.pagina.waitForFunction(
    () => Array.from(window.fbq?.queue ?? []).some((c) => c[1] === "AddToCart"),
    null,
    { timeout: 15000 }
  )
  const noProduto = await filas(semResposta.pagina)
  const viu = noProduto.meta.find((c) => c[1] === "ViewContent")?.[2]
  const pos = noProduto.meta.find((c) => c[1] === "AddToCart")?.[2]
  ok(
    viu?.content_ids?.[0]?.startsWith("variant_") &&
      viu.currency === "BRL" &&
      pos?.content_ids?.[0] === viu.content_ids[0] &&
      temChamada(noProduto.google, "event", "view_item") &&
      temChamada(noProduto.google, "event", "add_to_cart") &&
      noProduto.tiktok.some((c) => c[0] === "track" && c[1] === "ViewContent") &&
      noProduto.tiktok.some((c) => c[0] === "track" && c[1] === "AddToCart") &&
      temChamada(noProduto.clarity, "event", "add_to_cart"),
    "o produto e a sacola chegam em cada um (ViewContent e AddToCart, com a variante), sem o “Entendi”",
    JSON.stringify({ viu, pos })
  )

  titulo("Pelo servidor também, com o mesmo id do pixel")
  const idNoPixel = (fila, nome) => fila.find((c) => c[1] === nome)?.[3]?.eventID ?? null
  const idNoTiktok = (fila, nome) =>
    fila.find((c) => c[0] === "track" && c[1] === nome)?.[3]?.event_id ?? null
  const ids = {
    ViewContent: idNoPixel(noProduto.meta, "ViewContent"),
    AddToCart: idNoPixel(noProduto.meta, "AddToCart"),
  }
  const peloServidor = await esperarPassos(
    passosAntesDoProduto,
    (l) =>
      ["meta", "tiktok"].every((p) =>
        Object.values(ids).every((id) => l.some((x) => x.plataforma === p && x.id === id))
      ),
    20000
  )
  const doServidor = (p, nome) => peloServidor.find((x) => x.plataforma === p && x.nome === nome)
  ok(
    Boolean(ids.ViewContent && ids.AddToCart) &&
      ids.ViewContent === idNoTiktok(noProduto.tiktok, "ViewContent") &&
      ids.AddToCart === idNoTiktok(noProduto.tiktok, "AddToCart") &&
      ["meta", "tiktok"].every(
        (p) =>
          doServidor(p, "ViewContent")?.id === ids.ViewContent &&
          doServidor(p, "AddToCart")?.id === ids.AddToCart
      ) &&
      doServidor("meta", "AddToCart")?.usuario?.client_user_agent?.length > 0 &&
      doServidor("meta", "AddToCart")?.pagina === `${LOJA}/produtos/shampoo-para-barba`,
    "o ViewContent e o AddToCart vão também pelo servidor pra Meta e pro TikTok, com o MESMO id que foi pro pixel (a plataforma junta os dois)",
    JSON.stringify({ ids, peloServidor })
  )
  ok(
    !peloServidor.some((x) => x.nome === "PageView" || x.nome === "Pageview"),
    "com o pixel funcionando, a visita à página não vai pelo servidor (o pixel já conta)",
    JSON.stringify(peloServidor.map((x) => [x.plataforma, x.nome]))
  )

  titulo("A recusa, na política de privacidade")
  // A marca some com a recarga: com as tags na página, a recusa recarrega pra tirá-las.
  await semResposta.pagina.goto(`${LOJA}/privacidade`)
  await hidratado(semResposta.pagina, '[data-resposta-dos-cookies="aceita"] [data-mudar-resposta]')
  await tagsNoAr(semResposta.pagina)
  await semResposta.pagina.evaluate(() => (window.__antesDoNao = true))
  const pedidosAntesDoNao = semResposta.pedidos.length
  await Promise.all([
    semResposta.pagina.waitForEvent("load", { timeout: 20000 }),
    semResposta.pagina
      .getByRole("button", { name: "Recusar os cookies de medição e anúncio" })
      .click(),
  ])
  await semResposta.pagina.locator('[data-resposta-dos-cookies="nao"]').waitFor({ timeout: 15000 })
  await esperar(1500)
  const depoisDoNao = await filas(semResposta.pagina)
  const cookiesDosParceiros = (await semResposta.contexto.cookies(LOJA))
    .map((c) => c.name)
    .filter((n) => DOS_PARCEIROS.some((d) => d.name === n))
  ok(
    (await valorDoCookie(semResposta.contexto)) === "nao.3.gmtc" &&
      !(await semResposta.pagina.evaluate(() => window.__antesDoNao === true)) &&
      !depoisDoNao.carregou.length &&
      !depoisDoNao.tags.length &&
      semResposta.pedidos.length === pedidosAntesDoNao &&
      !cookiesDosParceiros.length &&
      (await semResposta.pagina.locator("[data-faixa-de-cookies]").count()) === 0,
    "“Recusar”: a resposta fica (versão 3), a página recarrega sem nenhuma tag, os cookies dos parceiros saem e a faixa some",
    JSON.stringify({
      cookie: await valorDoCookie(semResposta.contexto),
      carregou: depoisDoNao.carregou,
      cookiesDosParceiros,
      pedidos: semResposta.pedidos.slice(pedidosAntesDoNao),
    })
  )
  await semResposta.pagina.goto(`${LOJA}/`)
  await hidratado(semResposta.pagina, 'main a[href^="/produtos/"]')
  await esperar(2500)
  const naHomeDepoisDoNao = await filas(semResposta.pagina)
  ok(
    !naHomeDepoisDoNao.carregou.length &&
      !naHomeDepoisDoNao.tags.length &&
      semResposta.pedidos.length === pedidosAntesDoNao &&
      (await semResposta.pagina.locator("[data-faixa-de-cookies]").count()) === 0,
    "e na página seguinte: nada liga, nada sai pra fora, e a faixa não volta",
    JSON.stringify({
      carregou: naHomeDepoisDoNao.carregou,
      pedidos: semResposta.pedidos.slice(pedidosAntesDoNao),
    })
  )
  await semResposta.pagina.goto(`${LOJA}/privacidade`)
  await hidratado(semResposta.pagina, '[data-resposta-dos-cookies="nao"] [data-mudar-resposta]')
  await Promise.all([
    semResposta.pagina.waitForEvent("load", { timeout: 20000 }),
    semResposta.pagina.getByRole("button", { name: "Voltar a aceitar os cookies" }).click(),
  ])
  await tagsNoAr(semResposta.pagina)
  // No `next dev`, o pedaço que chega por streaming pode deixar uma cópia escondida: vale a visível.
  const aceitaDeNovo = semResposta.pagina
    .locator('[data-resposta-dos-cookies="aceita"]')
    .filter({ visible: true })
  await aceitaDeNovo.first().waitFor({ timeout: 10000 })
  const depoisDoVoltar = {
    cookie: await valorDoCookie(semResposta.contexto),
    aceita: await aceitaDeNovo.count(),
    faixa: await semResposta.pagina.locator("[data-faixa-de-cookies]").count(),
  }
  ok(
    depoisDoVoltar.cookie === null && depoisDoVoltar.aceita === 1 && depoisDoVoltar.faixa === 1,
    "“Voltar a aceitar”: a resposta sai, e as tags e a faixa voltam, como na primeira visita",
    JSON.stringify(depoisDoVoltar)
  )
  await semResposta.contexto.close()

  titulo("O “Entendi”")
  const entendi = await visitaNaLoja()
  await entendi.pagina.goto(`${LOJA}/`)
  await entendi.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  await hidratado(entendi.pagina, "[data-faixa-de-cookies] button")
  await tagsNoAr(entendi.pagina)
  await entendi.pagina.getByRole("button", { name: "Entendi" }).click()
  await entendi.pagina
    .locator("[data-faixa-de-cookies]")
    .waitFor({ state: "detached", timeout: 10000 })
  await esperar(1500)
  const depoisDoEntendi = await filas(entendi.pagina)
  ok(
    (await valorDoCookie(entendi.contexto)) === "sim.3.gmtc" && umaVezCada(depoisDoEntendi),
    "“Entendi”: a resposta fica (versão 3), a faixa some e nenhuma tag carrega de novo",
    JSON.stringify({
      cookie: await valorDoCookie(entendi.contexto),
      carregou: depoisDoEntendi.carregou,
    })
  )
  // Com o sim gravado, a página seguinte liga tudo de novo, sem a faixa.
  await entendi.pagina.goto(`${LOJA}/barba`)
  await tagsNoAr(entendi.pagina)
  await esperar(1000)
  ok(
    todasLigadas(await filas(entendi.pagina)) &&
      (await entendi.pagina.locator("[data-faixa-de-cookies]").count()) === 0,
    "com o “Entendi” gravado: todas ligam em cada página, e a faixa não aparece",
    JSON.stringify((await filas(entendi.pagina)).carregou)
  )
  await entendi.contexto.close()

  titulo("Quem tem o pixel bloqueado: tudo pelo servidor")
  const FBCLID = `IwAR0conferidor_${RODADA}`
  const TTCLID = `E.C.P.conferidor-${RODADA}`
  const antesDoBloqueio = anuncios.recebidos.length
  const bloqueado = await visitaNaLoja(
    [],
    {},
    { bloquear: ["connect.facebook.net", "analytics.tiktok.com"] }
  )
  await bloqueado.pagina.goto(`${LOJA}/?fbclid=${FBCLID}&ttclid=${TTCLID}`)
  const naHome = await esperarPassos(
    antesDoBloqueio,
    (l) =>
      l.some((x) => x.plataforma === "meta" && x.nome === "PageView") &&
      l.some((x) => x.plataforma === "tiktok" && x.nome === "Pageview")
  )
  const pvMeta = naHome.find((x) => x.plataforma === "meta" && x.nome === "PageView")
  const pvTiktok = naHome.find((x) => x.plataforma === "tiktok" && x.nome === "Pageview")
  const fbpNoNavegador = (await bloqueado.contexto.cookies(LOJA)).find((c) => c.name === "_fbp")
  ok(
    pvMeta?.pagina === `${LOJA}/` &&
      /^fb\.1\.\d+\.\d+$/.test(pvMeta?.usuario?.fbp ?? "") &&
      pvMeta?.usuario?.fbp === fbpNoNavegador?.value &&
      pvMeta?.usuario?.fbc?.endsWith(`.${FBCLID}`) &&
      pvTiktok?.pagina === `${LOJA}/` &&
      pvTiktok?.usuario?.ttclid === TTCLID,
    "pixel bloqueado: a visita à home vai pelo servidor pra Meta (com o _fbp que a loja criou e o _fbc do clique) e pro TikTok (com o ttclid)",
    JSON.stringify({ naHome, fbp: fbpNoNavegador?.value })
  )
  const linkDoProdutoBloqueado = 'main a[href^="/produtos/"]'
  await hidratado(bloqueado.pagina, linkDoProdutoBloqueado)
  await bloqueado.pagina
    .locator(linkDoProdutoBloqueado)
    .first()
    .evaluate((a) => a.click())
  await bloqueado.pagina.waitForURL(/\/produtos\//, { timeout: 15000 })
  const caminhoDoProduto = new URL(bloqueado.pagina.url()).pathname
  await hidratado(bloqueado.pagina, ".compra__comprar")
  await bloqueado.pagina.locator(".compra__comprar").click()
  const noProdutoBloqueado = await esperarPassos(antesDoBloqueio, (l) =>
    ["meta", "tiktok"].every((p) => l.some((x) => x.plataforma === p && x.nome === "AddToCart"))
  )
  const pvDoProduto = noProdutoBloqueado.filter(
    (x) => /^Page[vV]iew$/.test(x.nome) && x.pagina === `${LOJA}${caminhoDoProduto}`
  )
  const sacolaMeta = noProdutoBloqueado.find(
    (x) => x.plataforma === "meta" && x.nome === "AddToCart"
  )
  ok(
    pvDoProduto.length === 2 &&
      ["meta", "tiktok"].every((p) =>
        noProdutoBloqueado.some((x) => x.plataforma === p && x.nome === "ViewContent")
      ) &&
      sacolaMeta?.usuario?.fbc?.endsWith(`.${FBCLID}`) &&
      sacolaMeta?.usuario?.fbp === pvMeta?.usuario?.fbp,
    "e na troca de página pro produto: a visita, o ViewContent e o AddToCart, pra Meta e pro TikTok, com os mesmos cookies",
    JSON.stringify(noProdutoBloqueado.map((x) => [x.plataforma, x.nome, x.pagina]))
  )
  await bloqueado.contexto.close()

  // Quem recusou na política: a rota da loja não repassa nada, nem pedida na mão.
  const recusou = await visitaNaLoja([{ name: "fb_consentimento", value: "nao.3.gmtc" }])
  await recusou.pagina.goto(`${LOJA}/`)
  const antesDoNaoPeloServidor = anuncios.recebidos.length
  await recusou.pagina.evaluate(
    (agora) =>
      fetch("/api/passos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passos: [
            {
              nome: "PageView",
              id: "recusou-1234",
              pagina: location.href,
              em: agora,
              para: ["meta"],
            },
          ],
        }),
      }),
    Math.floor(Date.now() / 1000)
  )
  await esperar(4000)
  ok(
    anuncios.recebidos.length === antesDoNaoPeloServidor,
    "quem recusou os cookies: nada vai pelo servidor, nem o que for pedido na mão",
    JSON.stringify(passosDesde(antesDoNaoPeloServidor))
  )
  await recusou.contexto.close()

  titulo("A campanha do link")
  // Cada parceiro lê a campanha no endereço da página em que liga: desde a 0230,
  // todos ligam na chegada, e leem ali.
  const CAMPANHA = {
    utm_source: "instagram",
    utm_medium: "cpc",
    utm_campaign: `conferidor-${RODADA}`,
    gclid: "Cj0KCQjw-gclid_de_teste",
    fbclid: "IwAR0-fbclid_de_teste",
  }
  /** O endereço tem a campanha inteira, cada parâmetro uma vez só. */
  const comACampanha = (endereco, campanha = CAMPANHA) => {
    const busca = new URL(endereco).searchParams
    return Object.entries(campanha).every(([k, v]) => busca.getAll(k).join() === v)
  }
  const soOEndereco = (pagina) =>
    pagina.evaluate(() => ({
      aqui: location.href,
      endereco: window.__endereco ?? {},
    }))
  const parceiros = ["google", "meta", "tiktok", "clarity"]

  const anuncio = await visitaNaLoja()
  await anuncio.pagina.goto(`${LOJA}/?${new URLSearchParams(CAMPANHA)}`)
  await tagsNoAr(anuncio.pagina)
  const naChegada = await soOEndereco(anuncio.pagina)
  ok(
    comACampanha(naChegada.aqui) &&
      new URL(naChegada.aqui).searchParams.size === Object.keys(CAMPANHA).length &&
      parceiros.every((p) => naChegada.endereco[p] && comACampanha(naChegada.endereco[p])),
    "chegou pelo anúncio: as quatro leem a campanha na chegada, e o endereço fica como veio, sem nada repetido",
    JSON.stringify(naChegada)
  )
  // Recarregar (ou abrir outra página da mesma aba) não traz a campanha de novo: os parceiros já têm.
  await anuncio.pagina.goto(`${LOJA}/barba`)
  await tagsNoAr(anuncio.pagina)
  const outraPagina = await soOEndereco(anuncio.pagina)
  ok(
    new URL(outraPagina.aqui).search === "" &&
      parceiros.every((p) => new URL(outraPagina.endereco[p] ?? LOJA).search === ""),
    "na página seguinte da mesma visita (as tags ligadas desde a carga), a campanha não volta",
    JSON.stringify(outraPagina)
  )
  await anuncio.contexto.close()

  // Sem campanha no link, o endereço não ganha nada.
  const direto = await visitaNaLoja()
  await direto.pagina.goto(`${LOJA}/barba`)
  await tagsNoAr(direto.pagina)
  const semCampanha = await soOEndereco(direto.pagina)
  ok(
    new URL(semCampanha.aqui).search === "" &&
      parceiros.every((p) => new URL(semCampanha.endereco[p] ?? LOJA).search === ""),
    "sem campanha no link: o endereço não ganha nada",
    semCampanha.aqui
  )
  await direto.contexto.close()

  titulo("A faixa aparece de novo")
  /** A resposta de antes não vale: a faixa aparece, e todas ligam (como sem resposta). */
  async function apareceDeNovo(valor, frase) {
    const visita = await visitaNaLoja([{ name: "fb_consentimento", value: valor }])
    await visita.pagina.goto(`${LOJA}/`)
    await visita.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
    await tagsNoAr(visita.pagina)
    await esperar(1000)
    ok(todasLigadas(await filas(visita.pagina)), frase, visita.pedidos.join(" "))
    await visita.contexto.close()
  }
  await apareceDeNovo(
    "sim",
    "o sim da versão 1 (só o Google Analytics) não vale: a faixa aparece, e todas ligam"
  )
  await apareceDeNovo(
    "sim.2.gmtc",
    "o sim da versão 2 (de antes do CRM da própria loja) não vale: a faixa aparece, e todas ligam"
  )
  await apareceDeNovo(
    "sim.3.g",
    "o sim só com o Google, com a Meta e o TikTok ligados depois: a faixa aparece de novo, e todas ligam"
  )

  titulo("A faixa e as barras do pé da tela")
  const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  const BOTOES_DA_FAIXA = ["[data-faixa-de-cookies] button"]
  /** Os que NÃO estão livres: no meio do botão, o navegador acha outra coisa. */
  const presos = (pagina, seletores) =>
    pagina.evaluate((lista) => {
      // O indicador do `next dev` mora no canto de baixo e não existe em produção.
      const dev = [...document.querySelectorAll("nextjs-portal")]
      dev.forEach((e) => (e.style.display = "none"))
      const saida = lista.filter((sel) => {
        const el = [...document.querySelectorAll(sel)].find((e) => e.checkVisibility())
        const r = el?.getBoundingClientRect()
        const achado = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !achado || (achado !== el && !el.contains(achado))
      })
      dev.forEach((e) => (e.style.display = ""))
      return saida
    }, seletores)
  const medidaDaFaixa = (pagina) =>
    pagina.evaluate(() => {
      const faixa = document.querySelector("[data-faixa-de-cookies]")
      const r = faixa.getBoundingClientRect()
      return {
        altura: Math.round(r.height),
        folga: Math.round(innerHeight - r.bottom),
        letra: getComputedStyle(faixa.querySelector("p")).fontSize,
        botoes: [...faixa.querySelectorAll("button")].map((b) =>
          Math.round(b.getBoundingClientRect().height)
        ),
      }
    })
  // A faixa acompanha a barra, que desliza em 0,26 s.
  const assentar = () => esperar(700)

  const cel = await visitaNaLoja([], CELULAR)
  await cel.pagina.goto(`${LOJA}/produtos/shampoo-para-barba`)
  await cel.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  await cel.pagina.locator(".barra-compra.e-visivel").waitFor({ timeout: 15000 })
  await assentar()
  const naPdp = await presos(cel.pagina, [...BOTOES_DA_FAIXA, ".barra-compra .btn"])
  ok(
    !naPdp.length,
    "a PDP no celular: a faixa fica em cima da barra de compra, com os botões das duas livres",
    `presos: ${naPdp.join(", ")}`
  )
  const compacta = await medidaDaFaixa(cel.pagina)
  ok(
    compacta.altura <= 150 && compacta.letra === "12px" && compacta.botoes.every((a) => a <= 40),
    "no celular a faixa é pequena: letra de 12 px, o botão ao lado do texto, até 150 px",
    JSON.stringify(compacta)
  )
  await cel.pagina
    .locator(".compra__comprar")
    .evaluate((b) => b.scrollIntoView({ block: "center" }))
  await cel.pagina
    .locator(".barra-compra:not(.e-visivel)")
    .waitFor({ state: "attached", timeout: 10000 })
  await assentar()
  const semBarra = await medidaDaFaixa(cel.pagina)
  ok(
    semBarra.folga <= 16,
    "com o botão da página à vista, a barra some e a faixa desce pro pé da tela",
    JSON.stringify(semBarra)
  )

  // O checkout precisa de sacola: o item entra com uma resposta dada (sem
  // faixa no caminho), e a resposta sai antes de abrir o checkout.
  await cel.contexto.addCookies([{ name: "fb_consentimento", value: "nao.3.gmtc", url: LOJA }])
  await cel.pagina.goto(`${LOJA}/produtos/shampoo-para-barba`)
  await hidratado(cel.pagina, ".compra__comprar")
  await cel.pagina.locator(".compra__comprar").click()
  const fim = Date.now() + 15000
  while (Date.now() < fim && !(await cel.contexto.cookies(LOJA)).some((c) => c.name === "carrinho"))
    await esperar(200)
  await cel.contexto.clearCookies({ name: "fb_consentimento" })
  await cel.pagina.goto(`${LOJA}/checkout`)
  await cel.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  // O Next pode guardar uma cópia escondida da tela: a que vale é a visível.
  await cel.pagina
    .locator(".barra .barra__btn")
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 20000 })
  await assentar()
  const noCheckout = await presos(cel.pagina, [...BOTOES_DA_FAIXA, ".barra .barra__btn"])
  ok(
    !noCheckout.length,
    "o checkout no celular: a faixa em cima da barra do total, com o botão do passo livre",
    `presos: ${noCheckout.join(", ")}`
  )
  await cel.contexto.close()

  const computador = await visitaNaLoja()
  await computador.pagina.goto(`${LOJA}/produtos/shampoo-para-barba`)
  await computador.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  await computador.pagina.mouse.wheel(0, 1600)
  await computador.pagina.locator(".barra-compra.e-visivel").waitFor({ timeout: 15000 })
  await assentar()
  const noComputador = await presos(computador.pagina, [...BOTOES_DA_FAIXA, ".barra-compra .btn"])
  ok(
    !noComputador.length,
    "a PDP no computador, rolada até a barra aparecer: os botões das duas livres",
    `presos: ${noComputador.join(", ")}`
  )
  await computador.contexto.close()

  /* ── a compra pelo servidor ───────────────────────────────────────────── */

  titulo("A compra pelo servidor")
  const email = `compra.${RODADA}@fuckingbarba.invalid`
  const pedido = await fabrica.pedidoPix(email)
  const semAssinatura = await rastro(pedido.id, rastroComSim, { assinado: false })
  const gravado = await rastro(pedido.id, rastroComSim)
  const denovo = await rastro(pedido.id, { ...rastroComSim, consentimento: "nao" })
  ok(
    semAssinatura.status === 401 &&
      gravado.corpo.gravado === true &&
      denovo.corpo.gravado === false,
    "o rastro: só com a assinatura da loja, e uma vez (o segundo não troca o primeiro)",
    `${semAssinatura.status} ${JSON.stringify(gravado.corpo)} ${JSON.stringify(denovo.corpo)}`
  )
  ok(!anuncios.doPedido(pedido.id).length, "o Pix esperando: nada sai antes do pagamento")
  await fabrica.pagar(pedido)
  for (let i = 0; i < 40 && anuncios.doPedido(pedido.id).length < 3; i++) await esperar(500)
  const chegou = Object.fromEntries(anuncios.doPedido(pedido.id).map((r) => [r.plataforma, r]))
  const cobrado = await fabrica.cobrado(pedido)
  const meta = chegou.meta?.corpo?.data?.[0]
  const ga4 = chegou.ga4?.corpo
  const tiktok = chegou.tiktok?.corpo?.data?.[0]
  ok(
    chegou.meta?.codigo === CODIGOS.metaPixel &&
      chegou.meta?.chave === "token-de-teste" &&
      meta?.event_name === "Purchase" &&
      meta?.event_id === pedido.id &&
      meta?.user_data?.em?.[0] === sha256(email) &&
      meta?.user_data?.ph?.[0] === sha256("5511988887777") &&
      meta?.user_data?.fbp === rastroComSim.meta.fbp &&
      meta?.user_data?.client_ip_address === "200.1.2.3" &&
      meta?.custom_data?.value === cobrado,
    "Meta: a Purchase com o id do pedido, o e-mail e o telefone embaralhados, e o valor cobrado",
    JSON.stringify({ meta, cobrado })
  )
  ok(
    chegou.ga4?.codigo === CODIGOS.ga4 &&
      chegou.ga4?.chave === "segredo-de-teste" &&
      ga4?.client_id === "123456789.1790000000" &&
      ga4?.events?.[0]?.name === "purchase" &&
      ga4?.events?.[0]?.params?.transaction_id === pedido.id &&
      ga4?.events?.[0]?.params?.session_id === "1790000123" &&
      ga4?.consent?.ad_user_data === "GRANTED" &&
      !JSON.stringify(ga4).includes(email),
    "GA4: o purchase com o client_id e a sessão do cookie, sem o e-mail (e o anúncio liberado, com o sim)",
    JSON.stringify(ga4)
  )
  ok(
    chegou.tiktok?.codigo === CODIGOS.tiktok &&
      chegou.tiktok?.chave === "token-de-teste" &&
      tiktok?.event === "Purchase" &&
      tiktok?.event_id === pedido.id &&
      tiktok?.user?.phone === sha256("+5511988887777") &&
      tiktok?.user?.ttp === rastroComSim.tiktok.ttp,
    "TikTok: a Purchase com o id do pedido e o telefone com o +",
    JSON.stringify(tiktok)
  )
  const noPedido = (await adm(`/admin/orders/${pedido.id}?fields=metadata`)).corpo.order?.metadata
  ok(
    ["meta", "ga4", "tiktok"].every((p) => noPedido?.fb_anuncios?.compra?.[p]?.como === "enviada"),
    "o pedido guarda o que saiu (uma vez por plataforma)",
    JSON.stringify(noPedido?.fb_anuncios)
  )

  const semSim = await fabrica.pedidoPix(`nao.${RODADA}@fuckingbarba.invalid`)
  await rastro(semSim.id, { em: new Date().toISOString(), consentimento: "nao" })
  await fabrica.pagar(semSim)
  let dispensado = null
  for (let i = 0; i < 30 && !dispensado; i++) {
    await esperar(500)
    dispensado = (await adm(`/admin/orders/${semSim.id}?fields=metadata`)).corpo.order?.metadata
      ?.fb_anuncios?.compra
  }
  ok(
    !anuncios.doPedido(semSim.id).length &&
      ["meta", "ga4", "tiktok"].every((p) => dispensado?.[p]?.motivo === "sem-consentimento"),
    "quem recusou na política de privacidade: a compra não sai pra ninguém",
    JSON.stringify(dispensado)
  )

  // Quem nunca clicou no "Entendi": as tags ligaram na chegada, e a compra vai pra todas (0230).
  const pedidoSemResposta = await fabrica.pedidoPix(`sem-resposta.${RODADA}@fuckingbarba.invalid`)
  await rastro(pedidoSemResposta.id, { ...rastroComSim, consentimento: null, parceiros: [] })
  await fabrica.pagar(pedidoSemResposta)
  let semRespostaNoPedido = null
  for (let i = 0; i < 30 && Object.keys(semRespostaNoPedido ?? {}).length < 3; i++) {
    await esperar(500)
    semRespostaNoPedido = (await adm(`/admin/orders/${pedidoSemResposta.id}?fields=metadata`)).corpo
      .order?.metadata?.fb_anuncios?.compra
  }
  const foiSemResposta = Object.fromEntries(
    anuncios.doPedido(pedidoSemResposta.id).map((r) => [r.plataforma, r.corpo])
  )
  ok(
    ["meta", "ga4", "tiktok"].every((p) => semRespostaNoPedido?.[p]?.como === "enviada") &&
      foiSemResposta.meta?.data?.[0]?.user_data?.fbp === rastroComSim.meta.fbp &&
      foiSemResposta.tiktok?.data?.[0]?.user?.ttp === rastroComSim.tiktok.ttp &&
      foiSemResposta.ga4?.client_id === "123456789.1790000000" &&
      foiSemResposta.ga4?.consent?.ad_user_data === "GRANTED",
    "quem nunca clicou no “Entendi”: a compra vai pra Meta, pro TikTok e pro GA4 (com o anúncio liberado), como as tags",
    JSON.stringify({ semRespostaNoPedido, ga4: foiSemResposta.ga4?.consent })
  )

  anuncios.roteiro.meta = "recusar"
  const recusado = await fabrica.pedidoPix(`recusa.${RODADA}@fuckingbarba.invalid`)
  await rastro(recusado.id, rastroComSim)
  await fabrica.pagar(recusado)
  let registro = null
  for (let i = 0; i < 30 && !registro?.meta; i++) {
    await esperar(500)
    registro = (await adm(`/admin/orders/${recusado.id}?fields=metadata`)).corpo.order?.metadata
      ?.fb_anuncios?.compra
  }
  anuncios.roteiro.meta = null
  let problema = null
  for (let i = 0; i < 20 && !problema; i++) {
    const obs = await medusa("/dashboard/observabilidade", { metodo: "GET", token: tokenDoDono })
    problema = (obs.corpo.problemas ?? []).find(
      (p) => p.area === "Anúncios" && p.situacao === "aberto"
    )
    if (!problema) await esperar(2500)
  }
  ok(
    registro?.meta?.como === "recusada" &&
      registro?.ga4?.como === "enviada" &&
      registro?.tiktok?.como === "enviada" &&
      /não cheg(ou|aram) nos anúncios/.test(problema?.titulo ?? ""),
    "a Meta recusou (a chave errada): as outras seguem, e vira problema na Observabilidade",
    JSON.stringify({ registro, problema: problema?.titulo })
  )

  titulo("A conversão do Google Ads, na tela de obrigado")
  // Sem resposta: a conversão também vale pra quem nunca clicou no "Entendi".
  const ads = await visitaNaLoja([{ name: "pedido", value: `${pedido.id}.${pedido.carrinho}` }])
  await ads.pagina.goto(`${LOJA}/checkout/obrigado/${pedido.id}`)
  await ads.pagina.waitForFunction(
    () => Array.from(window.dataLayer ?? []).some((c) => c[0] === "event" && c[1] === "conversion"),
    null,
    { timeout: 20000 }
  )
  const conversao = (await filas(ads.pagina)).google.find(
    (c) => c[0] === "event" && c[1] === "conversion"
  )?.[2]
  ok(
    conversao?.send_to === `${CODIGOS.googleAds}/${CODIGOS.googleAdsCompra}` &&
      conversao?.transaction_id === pedido.id &&
      conversao?.value === cobrado,
    "o pedido pago: a conversão de compra do Google Ads, com o id do pedido",
    JSON.stringify(conversao)
  )
  await ads.contexto.close()

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  await adm("/admin/configuracoes", { metodo: "POST", corpo: antes })
  if (tokenDoDono) {
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
  }
  await navegador.close()
  await resend.fechar()
  await anuncios.fechar()
  await pagarme.fechar?.()
  await frenet.fechar?.()
}

process.exit(resumo())
