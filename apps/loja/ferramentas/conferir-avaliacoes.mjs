/**
 * CONFERIDOR DAS AVALIAÇÕES — o e-mail um dia depois da entrega, a página
 * escondida /avaliar (pelo botão do e-mail e sem ele) e a avaliação aprovada
 * no site.
 *
 *   node ferramentas/conferir-avaliacoes.mjs [url-da-loja]
 *
 * Variáveis: LOJA (ou o argumento), MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 *            PORTA_RESEND (a do `RESEND_URL` do backend, padrão 4330),
 *            PORTA_FALSA (a Frenet falsa, a do `FRENET_URL`, padrão 4310),
 *            PORTA_PAGARME_FALSO (a do `PAGARME_URL`, padrão 4320),
 *            FRENET_WEBHOOK_TOKEN e MEDUSA_WEBHOOK_SEGREDO (os do backend;
 *            padrão, os de teste do AGENTS.md), REVALIDAR_SEGREDO (o do
 *            backend: as chamadas à API vão assinadas com o IP da rodada, e
 *            sem ele o limite dos chutes errados não é conferido), CHROMIUM.
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ Quem recebeu o pedido consegue avaliar sem conta, e a avaliação chega  │
 * │ no site depois do painel. As partes que só funcionam juntas:           │
 * │                                                                         │
 * │   o Medusa → a entrega do rastreio, a rodada do e-mail                 │
 * │              (`POST /admin/avaliacoes/pedir`, a mesma do job), o link   │
 * │              assinado e a avaliação guardada (`/store/avaliacoes`);    │
 * │   o e-mail → um por pedido, com um botão por produto;                  │
 * │   a loja   → o botão guarda o link num cookie e abre /avaliar limpa,   │
 * │              o formulário, o "valeu", a página sem o link (o número,  │
 * │              o e-mail e a avaliação num envio só, com a lista da loja │
 * │              inteira; o kit abre o que vem nele) e a aprovada na      │
 * │              página do produto.                                        │
 * │                                                                         │
 * │ A tela é comparada com o que o Medusa guardou (`GET /admin/avaliacoes`)│
 * │ e os e-mails, lidos do Resend falso.                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O PEDIDO É DE VERDADE, no banco local: Pix pago (o Pagar.me falso), postado
 * pelo admin e ENTREGUE HÁ DOIS DIAS por um aviso da Frenet com a hora da
 * transportadora — é a hora que a rodada olha. O backend precisa dos falsos
 * (ver AGENTS.md) e da loja no `LOJA_URL` dele (a aprovada avisa a loja).
 * No fim, as avaliações da rodada são recusadas e apagadas: o site volta
 * como estava.
 */

import { chromium } from "playwright"
import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
const TOKEN_DA_FRENET = process.env.FRENET_WEBHOOK_TOKEN ?? "token-de-teste"
const SEGREDO = process.env.REVALIDAR_SEGREDO ?? ""

if (!ADMIN_EMAIL || !ADMIN_SENHA || !CHAVE) {
  console.log("  ⚠  faltam ADMIN_EMAIL, ADMIN_SENHA ou a chave publicável — nada a conferir")
  process.exit(1)
}

let passou = 0
let falhou = 0
const ok = (cond, texto, detalhe = "") => {
  console.log(
    `${cond ? "  ok  " : " FALHA"} ${texto}${cond || !detalhe ? "" : `\n         ${detalhe}`}`
  )
  cond ? passou++ : falhou++
}
const titulo = (t) => console.log(`\n${t}`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const RODADA = Date.now().toString(36)
const EMAIL = `avaliar.${RODADA}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >>> 16) % 250}.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`
const OLEO = "oleo-para-barba"
const BALM = "balm-para-barba"
const KIT = "kit-completo-para-barba"
const FATOR = "fator-de-crescimento-para-barba"

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

/**
 * A API da loja, como o servidor da loja chama: assinada com o IP da rodada
 * (`x-loja-segredo` + `x-cliente-ip`), pra os limites por IP de uma rodada
 * não pesarem na seguinte. Sem o segredo, vai sem assinatura.
 */
async function loja(caminho, { metodo = "GET", corpo, ip = IP } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(SEGREDO ? { "x-loja-segredo": SEGREDO, "x-cliente-ip": ip } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
})
if (!entrar.ok) {
  console.log(`  ⚠  o login do admin falhou (${entrar.status})`)
  process.exit(1)
}
const { token } = await entrar.json()
async function admin(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

{
  const r = await admin("/admin/avaliacoes?pedido=order_nenhum")
  if (r.status === 404) {
    console.log("  ⚠  o backend não tem a rota /admin/avaliacoes — suba o desta versão")
    process.exit(1)
  }
}

/* ── os falsos ────────────────────────────────────────────────────────────── */

const resend = await subirResendFalso({ porta: Number(process.env.PORTA_RESEND || 4330) }).catch(
  (e) => {
    console.log(`  ⚠  não consegui subir o Resend falso (${e.message}) — outro processo na porta?`)
    process.exit(1)
  }
)
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
  },
})
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin: token, pagarme })
console.log(`  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta} · Pagar.me :${pagarme.porta}`)

/* ── a Frenet avisando a entrega, com a hora da transportadora ────────────── */

/** "21/09/2026 14:30" — a hora de Brasília, como a Frenet escreve. */
const hora = (minutosAtras) =>
  new Date(Date.now() - minutosAtras * 60_000)
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "")
const evento = (codigo, minutosAtras, descricao) => ({
  EventDateTime: hora(minutosAtras),
  EventDescription: descricao,
  EventLocation: "Blumenau-SC",
  EventType: String(codigo),
})
async function avisoDaFrenet(corpo) {
  const r = await fetch(`${MEDUSA}/hooks/envio/frenet`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-token": TOKEN_DA_FRENET },
    body: JSON.stringify(corpo),
  })
  return r.status
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
comAFaixaRespondida(navegador, LOJA)
const noConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const abas = []
async function novaAba(viewport = { width: 1280, height: 900 }) {
  const contexto = await navegador.newContext({
    viewport,
    extraHTTPHeaders: { "x-real-ip": IP },
    ...(viewport.width < 600 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  const recarga = vigiarRecargaDoDev(contexto)
  contexto.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !RUIDO_DE_DEV.test(m.text()) &&
      !recarga(m) &&
      noConsole.push(m.text())
  )
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(60_000)
  pagina.setDefaultNavigationTimeout(120_000)
  pagina.on("pageerror", (e) => noConsole.push(String(e)))
  abas.push(contexto)
  return { contexto, pagina }
}

/**
 * Espera a página assentar com UM formulário só. No `next dev`, o bloco que
 * chega em streaming fica um instante em dobro — a cópia escondida do HTML
 * ainda na página quando a de verdade já apareceu (a main também) —, e um
 * seletor estrito (`inputValue`, `getAttribute`) pega os dois.
 */
async function umSo(pagina, seletor) {
  await pagina.waitForFunction((s) => document.querySelectorAll(s).length === 1, seletor)
}

/** Espera o React assumir o elemento (o clique antes da hidratação se perde). */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s)].some((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps"))
      ),
    seletor,
    { timeout: 60_000 }
  )
}

const texto = async (pagina, seletor) =>
  ((await pagina.locator(seletor).first().textContent()) ?? "").replace(/\s+/g, " ").trim()

/**
 * Abre a página do produto até ela mostrar o que o painel acabou de mudar:
 * a loja refaz a página quando o Medusa avisa, e a primeira visita depois do
 * aviso ainda pode vir com a de antes enquanto a nova se monta.
 */
async function pdpAte(pagina, handle, condicao, tentativas = 8) {
  for (let i = 1; i <= tentativas; i++) {
    await pagina.goto(`${LOJA}/produtos/${handle}`, { waitUntil: "load" })
    await pagina.waitForSelector("section.pdp")
    if (await condicao()) return i
    await esperar(1500)
  }
  return 0
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

let pedido = null
const criadas = []

try {
  titulo("1. Um pedido pago, com dois produtos, entregue há dois dias")
  pedido = await fabrica.pedidoPix(EMAIL, [
    [OLEO, 1],
    [BALM, 1],
  ])
  await fabrica.pagar(pedido)
  const codigo = `AV${String(Date.now()).slice(-9)}BR`
  await fabrica.enviar(pedido, { codigo, avisar: false })
  const status = await avisoDaFrenet({
    OrderId: String(pedido.numero),
    TrackingNumber: codigo,
    ServiceDescrition: "PAC",
    TrackingEvents: [
      evento(18, 3 * 24 * 60, "Objeto postado"),
      evento(9, 2 * 24 * 60, "Objeto entregue ao destinatário"),
    ],
  })
  ok(status === 200, `a Frenet avisou a entrega do #${pedido.numero}`, `HTTP ${status}`)

  titulo("2. O e-mail, um dia depois da entrega")
  const antes = await loja(`/store/avaliacoes/pedido?p=order_${"0".repeat(26)}.${"a".repeat(22)}`)
  ok(antes.status === 404, "link que a loja não fez não abre pedido", `HTTP ${antes.status}`)
  const rodada1 = (await admin("/admin/avaliacoes/pedir", { metodo: "POST" })).corpo.relatorio
  ok(rodada1?.foraDoHorario === false, "o botão do admin roda fora do horário também")
  let email = null
  for (let i = 0; i < 20 && !email; i++) {
    email = resend.emails.find(
      (e) => e.to?.includes(EMAIL) && /o que você achou\?$/.test(e.subject ?? "")
    )
    if (!email) await esperar(500)
  }
  ok(Boolean(email), "o e-mail chegou pra quem comprou")
  ok(
    email?.subject === `Pedido #${pedido.numero}: o que você achou?`,
    "o assunto diz o pedido",
    email?.subject
  )
  ok(
    email?.tags?.some((t) => t.name === "tipo" && t.value === "pedir-avaliacao"),
    "leva a etiqueta tipo do CRM (pedir-avaliacao)",
    JSON.stringify(email?.tags)
  )
  const links = [...(email?.html ?? "").matchAll(/href="([^"]*\/avaliar\/[^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  )
  ok(links.length === 2, "um botão por produto", String(links.length))
  const primeiro = links[0] ? new URL(links[0]) : null
  ok(
    primeiro?.searchParams.get("utm_campaign") === "avaliacao" &&
      /^\/avaliar\/order_[0-9A-Z]{26}\.[A-Za-z0-9_-]{22}$/.test(primeiro.pathname),
    "o botão leva o link assinado do pedido e a campanha",
    links[0]
  )
  ok(
    /instagram\.com\/fuckingbarba/.test(email?.html ?? "") &&
      /tiktok\.com\/@fuckingbarba/.test(email?.html ?? ""),
    "o rodapé tem o Instagram e o TikTok"
  )
  const quantos = resend.emails.filter((e) => e.to?.includes(EMAIL)).length
  await admin("/admin/avaliacoes/pedir", { metodo: "POST" })
  await esperar(800)
  ok(
    resend.emails.filter((e) => e.to?.includes(EMAIL)).length === quantos,
    "a segunda rodada não manda de novo (um e-mail por pedido)"
  )

  titulo("3. A página pelo botão do e-mail")
  const { pagina } = await novaAba()
  const produtoDoBotao = primeiro?.searchParams.get("produto")
  await pagina.goto(links[0], { waitUntil: "load" })
  await pagina.waitForSelector("[data-avaliar]")
  await umSo(pagina, "[data-avaliar]")
  const url = new URL(pagina.url())
  ok(url.pathname === "/avaliar", "o botão guarda o link e abre a /avaliar", url.pathname)
  ok(!/order_/.test(pagina.url()), "o link não fica no endereço", pagina.url())
  ok(url.searchParams.get("utm_campaign") === "avaliacao", "a campanha vai junto (Marketing)")
  const robots = await pagina.locator('meta[name="robots"]').getAttribute("content")
  ok(/noindex/.test(robots ?? ""), "a página fica fora do Google (noindex)", robots)
  ok(
    (await texto(pagina, ".avaliar__pedido")) === `Pedido #${pedido.numero}`,
    "o número do pedido vem do link",
    await texto(pagina, ".avaliar__pedido")
  )
  ok(
    (await pagina.inputValue('input[name="nome"]')) === "Rafael T.",
    "o nome vem sugerido do pedido (primeiro nome e a inicial)",
    await pagina.inputValue('input[name="nome"]')
  )
  const marcado = await pagina.locator('input[name="produto"]:checked').getAttribute("value")
  ok(marcado === produtoDoBotao, "o produto do botão vem marcado", `${marcado} ≠ ${produtoDoBotao}`)
  ok((await pagina.locator('input[name="produto"]').count()) === 2, "os dois produtos do pedido")

  await hidratado(pagina, "[data-avaliar] button[type=submit]")
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector(".campo__erro:not(:empty)")
  ok(
    /estrelas/.test(await texto(pagina, ".campo__erro:not(:empty)")),
    "sem as estrelas, o erro aparece embaixo delas",
    await texto(pagina, ".campo__erro:not(:empty)")
  )
  const TEXTO_1 = `Teste ${RODADA}: segurou o dia todo.\n\nRecomendo pra quem tem barba rebelde.`
  await pagina.click(".avaliar__estrela:nth-child(4)")
  await pagina.fill('input[name="nome"]', "Rafael Teste")
  await pagina.fill('textarea[name="texto"]', TEXTO_1)
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector("[data-avaliacao-enviada]")
  ok(
    /^Valeu, Rafael!/.test(await texto(pagina, "[data-avaliacao-enviada] h1")),
    "o valeu, com o primeiro nome",
    await texto(pagina, "[data-avaliacao-enviada] h1")
  )
  const outro = pagina.locator("[data-avaliar-outro]")
  ok((await outro.count()) === 1, "e oferece o outro produto do pedido")
  const idDoOutro = await outro.first().getAttribute("data-avaliar-outro")
  await outro.first().click()
  await pagina.waitForSelector("[data-avaliar]")
  await umSo(pagina, "[data-avaliar]")
  await pagina.waitForFunction(
    (id) => document.querySelector(`input[name="produto"][value="${id}"]`)?.checked,
    idDoOutro
  )
  ok(true, "avaliar o outro abre o formulário com ele marcado")
  await pagina.waitForFunction(
    () => document.querySelectorAll(".avaliar__produto[data-avaliado] input[disabled]").length === 1
  )
  ok(true, "o já avaliado fica marcado como tal, e não dá pra escolher de novo")
  await hidratado(pagina, "[data-avaliar] button[type=submit]")
  await pagina.click(".avaliar__estrela:nth-child(2)")
  await pagina.fill('textarea[name="texto"]', `Teste ${RODADA}: não gostei do cheiro.`)
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector("[data-avaliacao-enviada]")
  ok(
    (await pagina.locator("[data-avaliar-outro]").count()) === 0 &&
      (await pagina.locator('[data-avaliacao-enviada] a[href="/"]').count()) === 1,
    "com os dois avaliados, o valeu leva de volta pra loja"
  )

  titulo("4. O que o Medusa guardou")
  const guardadas = (await admin(`/admin/avaliacoes?pedido=${pedido.id}`)).corpo.avaliacoes ?? []
  criadas.push(...guardadas.map((a) => a.id))
  ok(guardadas.length === 2, "as duas avaliações, do pedido", String(guardadas.length))
  const doBotao = guardadas.find((a) => a.produto_id === produtoDoBotao)
  ok(
    doBotao?.nota === 4 &&
      doBotao?.nome === "Rafael Teste" &&
      doBotao?.texto === TEXTO_1 &&
      doBotao?.situacao === "nova",
    "a nota, o nome e o texto como a pessoa escreveu, esperando o painel",
    JSON.stringify(doBotao)
  )
  const outroGuardado = guardadas.find((a) => a.produto_id === idDoOutro)
  ok(outroGuardado?.nota === 2, "a nota baixa também entra, igual", JSON.stringify(outroGuardado))
  const p = new URL(links[0]).pathname.split("/").pop()
  const denovo = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: { p, produto: produtoDoBotao, nome: "Rafael", nota: 5, texto: "De novo" },
  })
  ok(
    denovo.status === 409 && denovo.corpo.message === "ja_avaliou",
    "o mesmo produto do mesmo pedido não vale duas notas",
    `HTTP ${denovo.status} ${denovo.corpo.message}`
  )
  const adulterado = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      p: `${p.slice(0, -1)}${p.endsWith("A") ? "B" : "A"}`,
      produto: produtoDoBotao,
      nome: "Rafael",
      nota: 5,
      texto: "Link mexido",
    },
  })
  ok(
    adulterado.status === 404,
    "link com a assinatura mexida é recusado",
    `HTTP ${adulterado.status}`
  )

  titulo("5. A página sem o link: o pedido, o e-mail e a avaliação num formulário só")
  const velho = await loja("/store/avaliacoes/encontrar", {
    metodo: "POST",
    corpo: { numero: pedido.numero, email: EMAIL },
  })
  ok(
    velho.status === 404,
    "o pedido do link por e-mail saiu (a página não manda mais e-mail)",
    `HTTP ${velho.status}`
  )
  // Um pedido pago com o Kit Completo: o kit abre o óleo, o balm e o shampoo — o Fator, não.
  const EMAIL_2 = `avaliar2.${RODADA}@teste.fuckingbarba.dev`
  const segundo = await fabrica.pedidoPix(EMAIL_2, [[KIT, 1]])
  await fabrica.pagar(segundo)
  const [oleo, kit, fator] = await Promise.all([OLEO, KIT, FATOR].map(produtoDaLoja))
  const daLoja = await produtosDaLoja()
  const semLink = (await novaAba({ width: 390, height: 844 })).pagina
  await semLink.goto(`${LOJA}/avaliar?produto=${OLEO}`, { waitUntil: "load" })
  await semLink.waitForSelector("[data-avaliar-direto]")
  await umSo(semLink, "[data-avaliar-direto]")
  const opcoes = await semLink
    .locator('select[name="produto"] option')
    .evaluateAll((os) => os.map((o) => o.value).filter(Boolean))
  ok(
    opcoes.length === daLoja.length && daLoja.every((id) => opcoes.includes(id)),
    "a lista é a da loja inteira — a página não sabe o que veio no pedido",
    `${opcoes.length} opções · ${daLoja.length} produtos na loja`
  )
  ok(
    (await semLink.inputValue('select[name="produto"]')) === oleo?.id &&
      (await semLink.locator(".avaliar__escolha img").count()) === 1,
    "o ?produto= do endereço abre com ele marcado, e a foto do lado"
  )
  ok(
    (await semLink.locator('[data-avaliar-direto] input[name="numero"]').count()) === 1 &&
      (await semLink.locator('[data-avaliar-direto] input[name="email"]').count()) === 1 &&
      (await semLink.locator('[data-avaliar-direto] input[name="nome"]').count()) === 1,
    "o número do pedido, o e-mail e o nome na mesma tela"
  )
  ok(
    await semLink.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "no celular, sem rolagem de lado (o nome comprido do produto cabe no select)"
  )
  await hidratado(semLink, "[data-avaliar-direto] button[type=submit]")
  await semLink.click("[data-avaliar-direto] button[type=submit]")
  await semLink.waitForSelector(".campo__erro:not(:empty)")
  ok(
    /número do pedido/.test(await texto(semLink, ".campo__erro:not(:empty)")),
    "vazio, o erro aponta o primeiro campo: o número do pedido",
    await texto(semLink, ".campo__erro:not(:empty)")
  )

  const TEXTO_2 = `Teste ${RODADA}: o óleo do kit deixou a barba macia.`
  const TEXTO_KIT = `Teste ${RODADA}: o kit tem tudo o que precisa.`
  /** Preenche tudo e manda; `espera` é o que a tela mostra quando a resposta chega. */
  async function mandar({ numero, email, produto, estrela, texto: t = TEXTO_2 }, espera) {
    await hidratado(semLink, "[data-avaliar-direto] button[type=submit]")
    await semLink.fill('input[name="numero"]', numero)
    await semLink.fill('input[name="email"]', email)
    await semLink.fill('input[name="nome"]', "João Teste")
    await semLink.selectOption('select[name="produto"]', produto)
    await semLink.click(`.avaliar__estrela:nth-child(${estrela})`)
    await semLink.fill('textarea[name="texto"]', t)
    await semLink.click("[data-avaliar-direto] button[type=submit]")
    await semLink.waitForFunction(espera)
  }
  const alerta = () => document.querySelector("[data-avaliar-direto] [role=alert]")?.textContent
  await mandar(
    {
      numero: `#${segundo.numero}`,
      email: "outra.pessoa@teste.fuckingbarba.dev",
      produto: oleo?.id,
      estrela: 5,
    },
    () =>
      /Não encontrei/.test(
        document.querySelector("[data-avaliar-direto] [role=alert]")?.textContent ?? ""
      )
  )
  ok(
    /Não encontrei um pedido com esse número e esse e-mail/.test(
      (await semLink.evaluate(alerta)) ?? ""
    ),
    "com o e-mail de outra pessoa, não acha o pedido",
    await semLink.evaluate(alerta)
  )
  ok(
    (await semLink.inputValue('input[name="numero"]')) === `#${segundo.numero}` &&
      (await semLink.inputValue('textarea[name="texto"]')) === TEXTO_2 &&
      (await semLink.inputValue('select[name="produto"]')) === oleo?.id &&
      (await semLink.locator('input[name="nota"]:checked').getAttribute("value")) === "5",
    "o formulário volta com o que estava escrito — o produto e a nota também"
  )
  await mandar(
    {
      numero: String(segundo.numero),
      email: EMAIL_2.toUpperCase(),
      produto: fator?.id,
      estrela: 5,
    },
    () =>
      [...document.querySelectorAll(".campo__erro")].some((e) =>
        /não veio nesse pedido/.test(e.textContent ?? "")
      )
  )
  ok(true, "o Fator não veio no kit: o erro aponta o produto")
  await mandar(
    { numero: String(segundo.numero), email: EMAIL_2.toUpperCase(), produto: oleo?.id, estrela: 5 },
    () => Boolean(document.querySelector("[data-avaliacao-enviada]"))
  )
  const valeu = await texto(semLink, "[data-avaliacao-enviada]")
  ok(
    /^Valeu, João!/.test(await texto(semLink, "[data-avaliacao-enviada] h1")) &&
      valeu.includes(oleo?.title ?? "?"),
    "o óleo, que veio no kit, entra — o valeu diz o primeiro nome e o produto",
    valeu
  )
  await semLink.click("[data-avaliar-outro-produto]")
  await semLink.waitForSelector("[data-avaliar-direto]")
  await umSo(semLink, "[data-avaliar-direto]")
  ok(
    (await semLink.inputValue('input[name="numero"]')) === String(segundo.numero) &&
      (await semLink.inputValue('input[name="email"]')) === EMAIL_2.toUpperCase() &&
      (await semLink.inputValue('input[name="nome"]')) === "João Teste" &&
      (await semLink.inputValue('select[name="produto"]')) === "" &&
      (await semLink.inputValue('textarea[name="texto"]')) === "" &&
      (await semLink.locator('input[name="nota"]:checked').count()) === 0,
    "avaliar outro produto volta com o pedido, o e-mail e o nome — o resto em branco"
  )
  await mandar(
    { numero: String(segundo.numero), email: EMAIL_2, produto: oleo?.id, estrela: 3 },
    () =>
      [...document.querySelectorAll(".campo__erro")].some((e) =>
        /já foi avaliado/.test(e.textContent ?? "")
      )
  )
  ok(true, "o mesmo produto do mesmo pedido não vale duas notas")
  await mandar(
    {
      numero: String(segundo.numero),
      email: EMAIL_2,
      produto: kit?.id,
      estrela: 4,
      texto: TEXTO_KIT,
    },
    () => Boolean(document.querySelector("[data-avaliacao-enviada]"))
  )
  ok(true, "o kit, também")

  const doSegundo = (await admin(`/admin/avaliacoes?pedido=${segundo.id}`)).corpo.avaliacoes ?? []
  criadas.push(...doSegundo.map((a) => a.id))
  const doOleo = doSegundo.find((a) => a.produto_id === oleo?.id)
  ok(
    doSegundo.length === 2 &&
      doOleo?.numero === segundo.numero &&
      doOleo?.nota === 5 &&
      doOleo?.nome === "João Teste" &&
      doOleo?.texto === TEXTO_2 &&
      doOleo?.situacao === "nova" &&
      !JSON.stringify(doSegundo).toLowerCase().includes(EMAIL_2),
    "as duas, ligadas ao pedido e esperando o painel — sem o e-mail guardado",
    JSON.stringify(doSegundo)
  )

  const outraVez = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      numero: segundo.numero,
      email: EMAIL_2,
      produto: kit?.id,
      nome: "João",
      nota: 5,
      texto: "De novo",
    },
  })
  ok(
    outraVez.status === 409 &&
      outraVez.corpo.message === "ja_avaliou" &&
      !("faltam" in outraVez.corpo),
    "pela API, a mesma régua — e a resposta não diz o que mais veio no pedido",
    `HTTP ${outraVez.status} ${JSON.stringify(outraVez.corpo)}`
  )
  const EMAIL_3 = `avaliar3.${RODADA}@teste.fuckingbarba.dev`
  const naoPago = await fabrica.pedidoPix(EMAIL_3, [[OLEO, 1]])
  const doNaoPago = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      numero: naoPago.numero,
      email: EMAIL_3,
      produto: oleo?.id,
      nome: "Ana",
      nota: 5,
      texto: "Nem chegou",
    },
  })
  ok(
    doNaoPago.status === 409 && doNaoPago.corpo.message === "nao_aceita",
    "o Pix que não foi pago não aceita avaliação",
    `HTTP ${doNaoPago.status} ${doNaoPago.corpo.message}`
  )
  if (SEGREDO) {
    // Outro IP, só pra isto: quem erra o número ou o e-mail 10 vezes numa hora para.
    const chute = `10.251.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`
    const tentar = (numero, email) =>
      loja("/store/avaliacoes", {
        metodo: "POST",
        ip: chute,
        corpo: { numero, email, produto: oleo?.id, nome: "Chute", nota: 5, texto: "Chute" },
      })
    const erros = []
    for (let i = 1; i <= 10; i++)
      erros.push(
        (await tentar(segundo.numero, `chute${i}.${RODADA}@teste.fuckingbarba.dev`)).status
      )
    const depois = await tentar(segundo.numero, EMAIL_2)
    ok(
      erros.every((s) => s === 404) && depois.status === 429,
      "dez chutes errados na hora e o IP para (até o certo) — 429",
      `${erros.join(",")} → ${depois.status}`
    )
  }

  titulo("6. Aprovada no painel, a avaliação vai pro site")
  const handleDoBotao = produtoDoBotao === (await produtoPorHandle(OLEO)) ? OLEO : BALM
  const handleDoOutro = handleDoBotao === OLEO ? BALM : OLEO
  const aprovada = await admin(`/admin/avaliacoes/${doBotao.id}`, {
    metodo: "POST",
    corpo: { acao: "aprovar" },
  })
  ok(aprovada.corpo.situacao === "aprovada", "o admin aprova", JSON.stringify(aprovada.corpo))
  const publicas = (await loja("/store/avaliacoes")).corpo.avaliacoes ?? []
  const publica = publicas.find((a) => a.id === doBotao.id)
  ok(
    publica?.produto === handleDoBotao && !("pedido_id" in (publica ?? {})),
    "a lista do site tem a aprovada, pelo handle, sem nada do pedido",
    JSON.stringify(publica)
  )
  ok(!publicas.some((a) => a.id === outroGuardado?.id), "a que não foi aprovada não sai")
  const { pagina: pdp } = await novaAba()
  const vezes = await pdpAte(pdp, handleDoBotao, async () =>
    (await pdp.locator("#avaliacoes .avaliacao__texto").allTextContents()).some((t) =>
      t.includes(`Teste ${RODADA}`)
    )
  )
  ok(vezes > 0, "a página do produto mostra a aprovada (avaliação antes dos trechos)", `${vezes}`)
  const nome = await pdp
    .locator("#avaliacoes .avaliacao", { hasText: `Teste ${RODADA}` })
    .locator(".avaliacao__nome")
    .textContent()
    .catch(() => "")
  ok(nome === "Rafael Teste", "com o nome que a pessoa escolheu", nome)
  const rotulo = await pdp
    .locator("#avaliacoes .avaliacao", { hasText: `Teste ${RODADA}` })
    .locator(".sr-only")
    .first()
    .textContent()
    .catch(() => "")
  ok(/compra verificada/.test(rotulo ?? ""), "e o selo de compra verificada", rotulo)
  const microdado = await pdp.evaluate(() => ({
    itemref: document.querySelector("section.pdp")?.getAttribute("itemref"),
    contagem: document.querySelector('#avaliacoes-nota meta[itemprop="reviewCount"]')?.content,
  }))
  ok(
    microdado.itemref === "avaliacoes-nota" && Number(microdado.contagem) >= 1,
    "a nota entra no Product (itemref), com a contagem",
    JSON.stringify(microdado)
  )
  await pdpAte(pdp, handleDoOutro, async () => true, 1)
  ok(
    !(
      await pdp
        .locator("#avaliacoes")
        .textContent()
        .catch(() => "")
    ).includes(`Teste ${RODADA}`),
    "a outra, ainda nova, não aparece na página do produto dela"
  )

  titulo("7. Tirar do site e apagar (o pedido de exclusão)")
  const recusada = await admin(`/admin/avaliacoes/${doBotao.id}`, {
    metodo: "POST",
    corpo: { acao: "recusar" },
  })
  ok(recusada.corpo.situacao === "recusada", "recusar tira do site")
  const apagarNova = await admin(`/admin/avaliacoes/${outroGuardado.id}`, {
    metodo: "POST",
    corpo: { acao: "apagar" },
  })
  ok(
    apagarNova.status === 409,
    "apagar de vez só a recusada (dois passos, pra boa não sumir num clique)",
    `HTTP ${apagarNova.status}`
  )
  const sumiu = await pdpAte(
    pdp,
    handleDoBotao,
    async () =>
      !(
        await pdp
          .locator("#avaliacoes")
          .textContent()
          .catch(() => "")
      ).includes(`Teste ${RODADA}`)
  )
  ok(sumiu > 0, "recusada, some da página do produto", `${sumiu}`)
} catch (e) {
  ok(false, "o conferidor quebrou", e instanceof Error ? e.stack : String(e))
} finally {
  // O site volta como estava: as avaliações da rodada saem do banco.
  for (const id of criadas) {
    await admin(`/admin/avaliacoes/${id}`, { metodo: "POST", corpo: { acao: "recusar" } })
    await admin(`/admin/avaliacoes/${id}`, { metodo: "POST", corpo: { acao: "apagar" } })
  }
  titulo("Console")
  ok(noConsole.length === 0, "nenhum erro no console", noConsole.join("\n         "))
  for (const c of abas) await c.close().catch(() => {})
  await navegador.close()
  await resend.fechar()
  await frenet.fechar?.()
  await pagarme.fechar?.()
}

/** O id do produto pelo handle, pela API da loja. */
async function produtoPorHandle(handle) {
  const { corpo } = await loja(`/store/products?handle=${handle}&fields=id`)
  return corpo.products?.[0]?.id
}

/** O id e o nome do produto pelo handle. */
async function produtoDaLoja(handle) {
  const { corpo } = await loja(`/store/products?handle=${handle}&fields=id,title`)
  return corpo.products?.[0]
}

/** Os ids dos produtos que a loja lista: os publicados, menos os kits de quantidade aposentados. */
async function produtosDaLoja() {
  const { corpo } = await loja("/store/products?limit=100&fields=id,metadata")
  return (corpo.products ?? [])
    .filter((p) => p.metadata?.tipo !== "kit-quantidade")
    .map((p) => p.id)
}

console.log(`\n${passou} ok · ${falhou} falha(s)`)
process.exit(falhou ? 1 : 0)
