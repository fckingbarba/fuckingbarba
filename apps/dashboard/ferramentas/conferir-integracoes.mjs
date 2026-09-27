/**
 * CONFERIDOR DAS INTEGRAÇÕES — o dono põe o código do GA4, do Google Ads, da
 * Meta, da Clarity e do TikTok no painel (Configurações → Integrações); a
 * loja liga o GA4 e a Clarity na primeira página, só pra medir (0166 e 0171,
 * como a Nuvemshop), e as outras tags só depois do "Aceitar" da faixa de
 * cookies; e a compra
 * sai do servidor quando o pagamento entra — pra Meta e o TikTok de quem
 * aceitou, pro GA4 de quem não recusou.
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
 * │ • script de terceiro, fora o GA4 e a Clarity, carregando ANTES do      │
 * │   "Aceitar" (a política promete que não); os dois antes do sim sem o   │
 * │   anúncio negado; o "Só o necessário" deixando o GA4, a Clarity ou os  │
 * │   cookies deles na página;                                             │
 * │ • a resposta de antes (a v1, ou sem um parceiro novo) valendo sem a    │
 * │   faixa perguntar de novo;                                             │
 * │ • a faixa embaixo da barra de compra da PDP (25/09: o "Aceitar" sumia  │
 * │   atrás dela no celular), ou cobrindo o botão da barra do checkout; a  │
 * │   faixa grande no celular;                                             │
 * │ • o produto, a sacola e a compra que não chegam em cada plataforma;    │
 * │ • a campanha do link (UTMs, gclid, fbclid) perdida por quem aceita     │
 * │   depois de trocar de página (27/09: a Clarity só via o site);         │
 * │ • a compra de quem recusou saindo pelo servidor; a de quem não         │
 * │   respondeu indo pra Meta ou o TikTok, ou não indo pro GA4; a recusa   │
 * │   da plataforma sem virar problema na Observabilidade;                 │
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
const TERCEIROS = [
  ["googletagmanager.com", deMentira("google")],
  ["connect.facebook.net", deMentira("meta")],
  ["analytics.tiktok.com", deMentira("tiktok")],
  ["clarity.ms", deMentira("clarity")],
]

const RASTREADORES =
  /(googletagmanager\.com|google-analytics\.com|doubleclick\.net|facebook\.(net|com)|tiktok\.com|clarity\.ms|bing\.com)$/

/** Uma visita à loja: os scripts de fora trocados por um de mentira, e anotados. */
async function visitaNaLoja(cookies = [], tela = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, ...tela })
  const pedidos = []
  await contexto.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (rota) => {
    const url = rota.request().url()
    const host = new URL(url).hostname
    const terceiro = TERCEIROS.find(([h]) => host.endsWith(h))
    // Só o que é de medição e anúncio conta; o resto de fora (uma foto) só não sai.
    if (RASTREADORES.test(host)) pedidos.push(url)
    if (terceiro)
      return rota.fulfill({ status: 200, contentType: "text/javascript", body: terceiro[1] })
    return rota.abort()
  })
  if (cookies.length) await contexto.addCookies(cookies.map((c) => ({ ...c, url: LOJA })))
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

const temChamada = (fila, ...partes) =>
  fila.some((c) => partes.every((p, i) => JSON.stringify(c[i]) === JSON.stringify(p)))

/** O GA4 e a Clarity já no ar (o de mentira anota quando carrega). */
const aMedicaoLigou = (pagina) =>
  pagina.waitForFunction(
    () => ["google", "clarity"].every((p) => (window.__carregou ?? []).includes(p)),
    null,
    { timeout: 20000 }
  )

/** Só o GA4 e a Clarity carregaram, e só eles pediram coisa pra fora — sem resposta, é o que vale (0166 e 0171). */
const soAMedicao = (visita, fila) =>
  [...fila.carregou].sort().join() === "clarity,google" &&
  visita.pedidos.length > 0 &&
  visita.pedidos.every((u) => /(googletagmanager\.com|clarity\.ms)$/.test(new URL(u).hostname))

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

  titulo("A loja: antes da resposta, só o GA4 e a Clarity")
  // Os cookies que o GA4 e a Clarity de verdade gravam (os de mentira não gravam nada): o "não" apaga.
  const recusa = await visitaNaLoja([
    { name: "_ga", value: "GA1.1.111111111.1790000000" },
    { name: `_ga_${CODIGOS.ga4.slice(2)}`, value: "GS2.1.s1790000000$o1$g0$t1790000000" },
    { name: "_clck", value: "abc123%7C2%7Cfq0%7C0%7C1" },
    { name: "_clsk", value: "xyz789%7C1790000000000%7C1%7C1%7Cd.clarity.ms%2Fcollect" },
  ])
  await recusa.pagina.goto(`${LOJA}/`)
  const faixa = recusa.pagina.locator("[data-faixa-de-cookies]")
  await faixa.waitFor({ timeout: 20000 })
  ok(
    semEspaco(await faixa.textContent()).includes(
      "O Google Analytics e a Clarity medem as visitas. Com o seu sim, também usamos cookies da própria loja, do Google, da Meta, do TikTok e da Microsoft"
    ),
    "a faixa diz que o GA4 e a Clarity já medem, e a quem é o sim: a própria loja, Google, Meta, TikTok e Microsoft",
    semEspaco(await faixa.textContent())
  )
  await aMedicaoLigou(recusa.pagina)
  await esperar(1000)
  const antesDoAceite = await filas(recusa.pagina)
  const padrao = antesDoAceite.google.find((c) => c[0] === "consent" && c[1] === "default")?.[2]
  ok(
    soAMedicao(recusa, antesDoAceite) &&
      temChamada(antesDoAceite.google, "config", CODIGOS.ga4) &&
      !temChamada(antesDoAceite.google, "config", CODIGOS.googleAds) &&
      padrao?.analytics_storage === "granted" &&
      ["ad_storage", "ad_user_data", "ad_personalization"].every((k) => padrao?.[k] === "denied") &&
      temChamada(antesDoAceite.clarity, "consentv2", {
        ad_Storage: "denied",
        analytics_Storage: "granted",
      }),
    "antes de responder: só o GA4 e a Clarity, medindo com o anúncio negado — nenhum outro script, nenhum outro pedido pra fora",
    JSON.stringify({ carregou: antesDoAceite.carregou, pedidos: recusa.pedidos, padrao })
  )
  // A marca some com a recarga: com o GA4 na página, o "não" recarrega pra tirá-lo.
  await recusa.pagina.evaluate(() => (window.__antesDoNao = true))
  const pedidosAntesDoNao = recusa.pedidos.length
  await Promise.all([
    recusa.pagina.waitForEvent("load", { timeout: 20000 }),
    faixa.getByRole("button", { name: "Só o necessário" }).click(),
  ])
  await esperar(1500)
  const depoisDoNao = await filas(recusa.pagina)
  const cookiesDoGa = (await recusa.contexto.cookies(LOJA))
    .map((c) => c.name)
    .filter((n) => /^_(ga|cl)/.test(n))
  ok(
    (await valorDoCookie(recusa.contexto)) === "nao.3.gmtc" &&
      !(await recusa.pagina.evaluate(() => window.__antesDoNao === true)) &&
      !depoisDoNao.carregou.length &&
      !depoisDoNao.tags.length &&
      recusa.pedidos.length === pedidosAntesDoNao &&
      !cookiesDoGa.length &&
      (await faixa.count()) === 0,
    "“Só o necessário”: a resposta fica (versão 3), a página recarrega sem o GA4 e a Clarity, os cookies deles saem e nada carrega",
    JSON.stringify({
      cookie: await valorDoCookie(recusa.contexto),
      carregou: depoisDoNao.carregou,
      cookiesDoGa,
      pedidos: recusa.pedidos.slice(pedidosAntesDoNao),
    })
  )
  await recusa.contexto.close()

  titulo("A loja: com o aceite")
  const sim = await visitaNaLoja()
  await sim.pagina.goto(`${LOJA}/`)
  await sim.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  // O sim chega com o GA4 e a Clarity já no ar (o caso de quase todo mundo): acrescenta o resto.
  await aMedicaoLigou(sim.pagina)
  await sim.pagina.getByRole("button", { name: "Aceitar" }).click()
  await sim.pagina.waitForFunction(() => (window.__carregou ?? []).length >= 4, null, {
    timeout: 15000,
  })
  const ligadas = await filas(sim.pagina)
  const anuncioLiberado = {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  }
  ok(
    (await valorDoCookie(sim.contexto)) === "sim.3.gmtc" &&
      ligadas.carregou.filter((p) => p === "google").length === 1 &&
      ligadas.carregou.filter((p) => p === "clarity").length === 1 &&
      temChamada(ligadas.clarity, "consentv2", {
        ad_Storage: "granted",
        analytics_Storage: "granted",
      }) &&
      temChamada(ligadas.google, "config", CODIGOS.ga4) &&
      temChamada(ligadas.google, "consent", "update", anuncioLiberado) &&
      temChamada(ligadas.google, "config", CODIGOS.googleAds) &&
      temChamada(ligadas.meta, "init", CODIGOS.metaPixel) &&
      temChamada(ligadas.meta, "track", "PageView") &&
      ligadas.tiktokPixels.includes(CODIGOS.tiktok) &&
      temChamada(ligadas.clarity, "consentv2"),
    "“Aceitar”: o anúncio do Google e o da Microsoft passam a valer (o GA4 e a Clarity não carregam de novo), e a Meta e o TikTok ligam na hora, cada um com o seu código",
    JSON.stringify({ carregou: ligadas.carregou, tiktok: ligadas.tiktokPixels })
  )

  await sim.pagina.goto(`${LOJA}/produtos/shampoo-para-barba`)
  const botao = sim.pagina.locator(".compra__comprar")
  await hidratado(sim.pagina, ".compra__comprar")
  await sim.pagina.waitForFunction(
    () => Array.from(window.fbq?.queue ?? []).some((c) => c[1] === "ViewContent"),
    null,
    { timeout: 15000 }
  )
  await botao.click()
  await sim.pagina.waitForFunction(
    () => Array.from(window.fbq?.queue ?? []).some((c) => c[1] === "AddToCart"),
    null,
    { timeout: 15000 }
  )
  const noProduto = await filas(sim.pagina)
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
    "o produto e a sacola chegam em cada um (ViewContent e AddToCart, com a variante)",
    JSON.stringify({ viu, pos })
  )
  await sim.contexto.close()

  titulo("A campanha do link, pra quem aceita depois")
  // Cada parceiro lê a campanha no endereço da página em que liga. Quem chega
  // pelo anúncio e aceita noutra página já não tem nada na barra: a loja
  // devolve a da chegada antes das tags (`devolverACampanha`, lib/chegada.ts).
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
      mesmaPagina: window.__mesmaPagina === true,
    }))
  const tagsNoAr = (pagina) =>
    pagina.waitForFunction(() => (window.__carregou ?? []).length >= 4, null, { timeout: 15000 })

  const anuncio = await visitaNaLoja()
  await anuncio.pagina.goto(`${LOJA}/?${new URLSearchParams(CAMPANHA)}`)
  await anuncio.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  const linkDoProduto = 'main a[href^="/produtos/"]'
  await hidratado(anuncio.pagina, linkDoProduto)
  // A marca some se a página recarregar: a troca tem que ser do próprio Next, como a do cliente.
  await anuncio.pagina.evaluate(() => (window.__mesmaPagina = true))
  await anuncio.pagina
    .locator(linkDoProduto)
    .first()
    .evaluate((a) => a.click())
  await anuncio.pagina.waitForURL(/\/produtos\//, { timeout: 15000 })
  const noProdutoAntes = await soOEndereco(anuncio.pagina)
  ok(
    noProdutoAntes.mesmaPagina && new URL(noProdutoAntes.aqui).search === "",
    "chegou pelo anúncio e foi pro produto sem responder a faixa: a campanha saiu da barra",
    noProdutoAntes.aqui
  )
  await anuncio.pagina.getByRole("button", { name: "Aceitar" }).click()
  await tagsNoAr(anuncio.pagina)
  const aceitou = await soOEndereco(anuncio.pagina)
  const parceiros = ["google", "meta", "tiktok", "clarity"]
  ok(
    aceitou.mesmaPagina &&
      new URL(aceitou.aqui).pathname === new URL(noProdutoAntes.aqui).pathname &&
      comACampanha(aceitou.aqui) &&
      parceiros.every((p) => aceitou.endereco[p] && comACampanha(aceitou.endereco[p])),
    "aceitou no produto: a campanha volta pro endereço antes das tags do sim, e as quatro a leem quando ligam (o GA4 e a Clarity, na chegada)",
    JSON.stringify(aceitou)
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

  // Quem aceita na página em que chegou: o endereço fica como veio, nada repetido.
  const naChegada = await visitaNaLoja()
  const DA_NEWSLETTER = { utm_source: "newsletter", utm_campaign: `chegada-${RODADA}` }
  await naChegada.pagina.goto(`${LOJA}/barba?${new URLSearchParams(DA_NEWSLETTER)}`)
  await naChegada.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  await naChegada.pagina.getByRole("button", { name: "Aceitar" }).click()
  await tagsNoAr(naChegada.pagina)
  const semRepetir = await soOEndereco(naChegada.pagina)
  ok(
    comACampanha(semRepetir.aqui, DA_NEWSLETTER) &&
      new URL(semRepetir.aqui).searchParams.size === 2 &&
      comACampanha(semRepetir.endereco.clarity ?? LOJA, DA_NEWSLETTER),
    "aceitou na página em que chegou: o endereço fica como veio, sem nada repetido",
    semRepetir.aqui
  )
  await naChegada.contexto.close()

  // Sem campanha no link, o endereço não ganha nada.
  const direto = await visitaNaLoja()
  await direto.pagina.goto(`${LOJA}/`)
  await direto.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
  await hidratado(direto.pagina, linkDoProduto)
  await direto.pagina
    .locator(linkDoProduto)
    .first()
    .evaluate((a) => a.click())
  await direto.pagina.waitForURL(/\/produtos\//, { timeout: 15000 })
  await direto.pagina.getByRole("button", { name: "Aceitar" }).click()
  await tagsNoAr(direto.pagina)
  const semCampanha = await soOEndereco(direto.pagina)
  ok(
    new URL(semCampanha.aqui).search === "" &&
      new URL(semCampanha.endereco.clarity ?? LOJA).search === "",
    "sem campanha no link: o endereço não ganha nada no “Aceitar”",
    semCampanha.aqui
  )
  await direto.contexto.close()

  titulo("A faixa pergunta de novo")
  /** A resposta de antes não vale: a faixa pergunta, e só o GA4 e a Clarity ligam (como sem resposta). */
  async function perguntaDeNovo(valor, frase) {
    const visita = await visitaNaLoja([{ name: "fb_consentimento", value: valor }])
    await visita.pagina.goto(`${LOJA}/`)
    await visita.pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 20000 })
    await aMedicaoLigou(visita.pagina)
    await esperar(1000)
    ok(soAMedicao(visita, await filas(visita.pagina)), frase, visita.pedidos.join(" "))
    await visita.contexto.close()
  }
  await perguntaDeNovo(
    "sim",
    "o sim da versão 1 (só o Google Analytics) não vale: a faixa pergunta, e só o GA4 e a Clarity ligam"
  )
  await perguntaDeNovo(
    "sim.2.gmtc",
    "o sim da versão 2 (de antes do CRM da própria loja) não vale: a faixa pergunta de novo, só o GA4 e a Clarity ligam"
  )
  await perguntaDeNovo(
    "sim.3.g",
    "o sim só pro Google, com a Meta e o TikTok ligados depois: a faixa pergunta de novo, só o GA4 e a Clarity ligam"
  )

  titulo("A faixa e as barras do pé da tela")
  const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  const BOTOES_DA_FAIXA = [
    "[data-faixa-de-cookies] button:nth-of-type(1)",
    "[data-faixa-de-cookies] button:nth-of-type(2)",
  ]
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
    "no celular a faixa é pequena: letra de 12 px, cada botão numa linha, até 150 px",
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
    "quem clicou em “Só o necessário”: a compra não sai pra ninguém",
    JSON.stringify(dispensado)
  )

  // Quem não respondeu a faixa: o GA4 contou a visita, e conta a compra — os outros, não.
  const semResposta = await fabrica.pedidoPix(`sem-resposta.${RODADA}@fuckingbarba.invalid`)
  await rastro(semResposta.id, {
    em: new Date().toISOString(),
    consentimento: null,
    ga: rastroComSim.ga,
    navegador: "Conferidor/1.0",
  })
  await fabrica.pagar(semResposta)
  let semRespostaNoPedido = null
  for (let i = 0; i < 30 && Object.keys(semRespostaNoPedido ?? {}).length < 3; i++) {
    await esperar(500)
    semRespostaNoPedido = (await adm(`/admin/orders/${semResposta.id}?fields=metadata`)).corpo.order
      ?.metadata?.fb_anuncios?.compra
  }
  const foiSemResposta = anuncios.doPedido(semResposta.id)
  const ga4SemResposta = foiSemResposta.find((r) => r.plataforma === "ga4")?.corpo
  ok(
    foiSemResposta.length === 1 &&
      ga4SemResposta?.client_id === "123456789.1790000000" &&
      ga4SemResposta?.consent?.ad_user_data === "DENIED" &&
      semRespostaNoPedido?.ga4?.como === "enviada" &&
      ["meta", "tiktok"].every((p) => semRespostaNoPedido?.[p]?.motivo === "sem-consentimento"),
    "quem não respondeu a faixa: a compra vai só pro GA4 (com o anúncio negado), como a visita; a Meta e o TikTok, não",
    JSON.stringify({ semRespostaNoPedido, ga4: ga4SemResposta })
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
  const ads = await visitaNaLoja([
    { name: "fb_consentimento", value: "sim.3.gmtc" },
    { name: "pedido", value: `${pedido.id}.${pedido.carrinho}` },
  ])
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
