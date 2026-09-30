/**
 * CONFERIDOR DO POP-UP DA 1ª COMPRA (entrega 0177) — o nome e o e-mail em
 * troca do cupom: `components/primeira-compra/`, `lib/primeira-compra.ts`,
 * `lib/acoes/primeira-compra.ts` e, no Medusa, `lib/crm/primeira-compra.ts`.
 *
 *   node ferramentas/conferir-primeira-compra.mjs [url-da-loja]
 *
 * Variáveis: LOJA (ou o argumento), MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 *            REVALIDAR_SEGREDO, PORTA_RESEND (a do `RESEND_URL` do backend)
 *            e CHROMIUM.
 *
 * O Medusa: o cadastro, o cupom (só na 1ª compra), o e-mail que chega na
 * hora, o mesmo código pra quem já se cadastrou, o "já é cliente" e o fluxo
 * desligado. A loja, no computador e no celular: quando o pop-up aparece (e
 * quando não), o erro, o cupom guardado pro checkout, o fechar e o sair da
 * página. O relógio da página é o do Playwright (`page.clock`): os 20
 * segundos passam na hora.
 */

import { chromium } from "playwright"
import { JA_RESPONDEU } from "./faixa-respondida.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA = (process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000").replace(/\/$/, "")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
const SEGREDO_LOJA = process.env.REVALIDAR_SEGREDO

if (!ADMIN_EMAIL || !ADMIN_SENHA || !CHAVE || !SEGREDO_LOJA) {
  console.log("  ⚠  faltam ADMIN_EMAIL, ADMIN_SENHA, a chave publicável ou o REVALIDAR_SEGREDO")
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
let n = 0
const novoEmail = () => `popup.${RODADA}.${++n}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >>> 16) % 250}.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`
const CODIGO = /^BEMVINDO-[2-9A-HJ-NP-Z]{6}$/

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

async function daLoja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      "x-loja-segredo": SEGREDO_LOJA,
      "x-cliente-ip": IP,
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

/* A chave das boas-vindas mora no metadata da loja: o conferidor desliga e devolve. */
const lojaDoAdmin = (await admin("/admin/stores?fields=id,metadata")).corpo.stores?.[0]
if (!lojaDoAdmin) {
  console.log("  ⚠  não achei a loja no admin")
  process.exit(1)
}
const metadataOriginal = lojaDoAdmin.metadata ?? {}
async function boasVindasLigado(ligado) {
  const fluxos = { ...(metadataOriginal.fb_crm_fluxos ?? {}) }
  fluxos["boas-vindas"] = { ...(fluxos["boas-vindas"] ?? {}), ligado }
  return admin(`/admin/stores/${lojaDoAdmin.id}`, {
    metodo: "POST",
    corpo: { metadata: { ...metadataOriginal, fb_crm_fluxos: fluxos } },
  })
}

const resend = await subirResendFalso({ porta: Number(process.env.PORTA_RESEND || 4330) })
const paraQuem = (email) => resend.emails.filter((e) => e.to?.includes(email))
async function esperarEmail(email, antes = 0, ms = 10000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const deste = paraQuem(email)
    if (deste.length > antes) return deste[deste.length - 1]
    await esperar(200)
  }
  return null
}

/* O carrinho de um produto, pelo Medusa: a sacola que o pop-up encontra no checkout. */
async function carrinhoCom(handle) {
  const regiao = (await daLoja("/store/regions")).corpo.regions?.[0]
  const produto = (await daLoja(`/store/products?handle=${handle}&fields=id,variants.id`)).corpo
    .products?.[0]
  const cart = (await daLoja("/store/carts", { metodo: "POST", corpo: { region_id: regiao?.id } }))
    .corpo.cart
  await daLoja(`/store/carts/${cart.id}/line-items`, {
    metodo: "POST",
    corpo: { variant_id: produto.variants[0].id, quantity: 1 },
  })
  return cart.id
}
const cuponsDoCarrinho = async (id) =>
  ((await daLoja(`/store/carts/${id}?fields=id,*promotions`)).corpo.cart?.promotions ?? []).map(
    (p) => p.code
  )

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
const abas = []
const noConsole = []
async function novaPagina({ celular = false, cookies = [] } = {}) {
  const contexto = await navegador.newContext(
    celular
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } }
  )
  abas.push(contexto)
  if (cookies.length) await contexto.addCookies(cookies.map((c) => ({ ...c, url: LOJA })))
  const pagina = await contexto.newPage()
  pagina.on("pageerror", (e) => noConsole.push(`${pagina.url()}: ${e.message}`))
  await pagina.clock.install()
  return { contexto, pagina }
}
const POPUP = "[data-primeira-compra] [role=dialog]"
const cookieDe = async (contexto, nome) =>
  (await contexto.cookies(LOJA)).find((c) => c.name === nome)?.value ?? null
/** Passa o tempo da página e dá um instante de verdade pro pedido ao servidor. */
async function passar(pagina, ms) {
  await pagina.clock.runFor(ms)
  await esperar(400)
}
async function apareceu(pagina, ms = 30000) {
  return pagina
    .locator(POPUP)
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true)
    .catch(() => false)
}
const naoTem = async (pagina) => (await pagina.locator(POPUP).count()) === 0

let desligou = false
try {
  /* ── 1. o Medusa ───────────────────────────────────────────────────────── */
  titulo("O Medusa: o cadastro, o cupom e o e-mail")
  const config = (await daLoja("/store/crm/primeira-compra")).corpo
  ok(
    config.ligado === true && Number.isInteger(config.porcento) && config.dias === 3,
    "o pop-up ligado, com o % do painel e 3 dias",
    JSON.stringify(config)
  )
  const P = config.porcento

  const semNome = await daLoja("/store/crm/primeira-compra", {
    metodo: "POST",
    corpo: { nome: "", email: novoEmail() },
  })
  const semEmail = await daLoja("/store/crm/primeira-compra", {
    metodo: "POST",
    corpo: { nome: "Rafael", email: "rafael" },
  })
  ok(
    semNome.status === 400 &&
      semNome.corpo.message === "nome_invalido" &&
      semEmail.status === 400 &&
      semEmail.corpo.message === "email_invalido",
    "sem nome ou com e-mail torto: 400, e nada é criado",
    JSON.stringify([semNome, semEmail])
  )

  const E1 = novoEmail()
  const r1 = await daLoja("/store/crm/primeira-compra", {
    metodo: "POST",
    corpo: { nome: "  rafael   silva ", email: E1, pagina: "/produtos/oleo-para-barba" },
  })
  const codigo1 = r1.corpo.codigo
  ok(
    r1.status === 200 &&
      r1.corpo.tipo === "ok" &&
      CODIGO.test(codigo1 ?? "") &&
      r1.corpo.porcento === P &&
      r1.corpo.nome === "Rafael",
    "o cadastro: o código BEMVINDO-, o % e o primeiro nome",
    JSON.stringify(r1)
  )
  const email1 = await esperarEmail(E1)
  ok(
    email1?.subject === `Seu cupom de ${P}% chegou` &&
      email1.html.includes(codigo1) &&
      email1.html.includes(
        `/discount/${codigo1}?utm_source=loja&amp;utm_medium=email&amp;utm_campaign=crm-boas-vindas`
      ) &&
      email1.html.includes("Oi, Rafael!") &&
      // A trilha: quem se cadastrou no óleo recebe os de cuidar da barba.
      email1.html.includes("Pra cuidar da barba") &&
      email1.html.includes("Óleo") &&
      email1.tags?.some((t) => t.name === "tipo" && t.value === "crm-boas-vindas") &&
      Boolean(email1.headers?.["List-Unsubscribe"]),
    "o e-mail chega na hora: o cupom, o link que aplica, o nome e os produtos da trilha",
    email1 ? email1.subject : "não chegou"
  )
  const promocao = (
    await admin(`/admin/promotions?code=${codigo1}&fields=code,rules.attribute,rules.values.value`)
  ).corpo.promotions?.[0]
  ok(
    promocao?.code === codigo1 &&
      promocao.rules?.some(
        (r) => r.attribute === "fb_cupons.pedidos" && r.values?.some((v) => v.value === "0")
      ),
    "o cupom é do Medusa, e só vale na primeira compra",
    JSON.stringify(promocao?.rules?.map((r) => r.attribute))
  )
  const lista = (await admin("/admin/newsletter")).corpo
  const inscricao = (lista.inscricoes ?? lista.newsletter ?? []).find((i) => i.email === E1)
  ok(
    inscricao?.origem === "popup",
    "o sim das ofertas, com a origem pop-up",
    JSON.stringify(inscricao)
  )

  const r1b = await daLoja("/store/crm/primeira-compra", {
    metodo: "POST",
    corpo: { nome: "Rafael", email: E1 },
  })
  await esperar(1500)
  ok(
    r1b.status === 200 &&
      r1b.corpo.tipo === "ja-cadastrado" &&
      r1b.corpo.codigo === codigo1 &&
      paraQuem(E1).length === 1,
    "o mesmo e-mail de novo: o mesmo código, e nenhum e-mail a mais",
    JSON.stringify({ r1b, emails: paraQuem(E1).length })
  )

  const deQuemComprou = (
    await admin("/admin/orders?limit=20&fields=email,status&order=-created_at")
  ).corpo.orders?.find((o) => o.email && o.status !== "canceled")?.email
  if (deQuemComprou) {
    const antes = paraQuem(deQuemComprou).length
    const r2 = await daLoja("/store/crm/primeira-compra", {
      metodo: "POST",
      corpo: { nome: "Cliente", email: deQuemComprou },
    })
    await esperar(1500)
    ok(
      r2.status === 200 &&
        r2.corpo.tipo === "ja-cliente" &&
        !r2.corpo.codigo &&
        paraQuem(deQuemComprou).length === antes,
      "quem já comprou: sem cupom e sem e-mail",
      JSON.stringify(r2)
    )
  } else ok(false, "quem já comprou: nenhum pedido no banco local pra conferir")

  desligou = true
  await boasVindasLigado(false)
  const desligado = (await daLoja("/store/crm/primeira-compra")).corpo
  const r3 = await daLoja("/store/crm/primeira-compra", {
    metodo: "POST",
    corpo: { nome: "Rafael", email: novoEmail() },
  })
  await boasVindasLigado(true)
  desligou = false
  ok(
    desligado.ligado === false && r3.status === 409 && r3.corpo.message === "desligado",
    "desligado no painel: o pop-up some, e o cadastro é recusado",
    JSON.stringify({ desligado, r3 })
  )

  /* ── 2. a loja, no computador ──────────────────────────────────────────── */
  titulo("Na loja, no computador")
  const pc = await novaPagina()
  await pc.pagina.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
  await pc.pagina.locator("h1").first().waitFor({ timeout: 60000 })
  await passar(pc.pagina, 21000)
  const comFaixa = await naoTem(pc.pagina)
  await pc.pagina.getByRole("button", { name: "Entendi" }).click()
  await passar(pc.pagina, 5000)
  ok(
    comFaixa && (await apareceu(pc.pagina)),
    "com a faixa de cookies na tela, nada; respondida, o pop-up aparece"
  )
  const dialogo = pc.pagina.locator(POPUP)
  const textoDoPopup = (await dialogo.textContent()) ?? ""
  const caixaDoX = await dialogo.getByRole("button", { name: "Fechar" }).boundingBox()
  ok(
    textoDoPopup.includes("Um presente pra começar") &&
      textoDoPopup.includes(`${P}%`) &&
      textoDoPopup.includes("junto com as ofertas da loja") &&
      textoDoPopup.includes("Vale 3 dias") &&
      Boolean(caixaDoX && caixaDoX.width >= 30 && caixaDoX.y >= 0),
    "o pop-up: o presente, o %, o aviso das ofertas, a validade e o X à vista",
    textoDoPopup.replace(/\s+/g, " ").slice(0, 200)
  )
  const botao = dialogo.getByRole("button", { name: "Quero meu cupom" })
  await botao.click()
  const erroSemNome = await dialogo
    .locator("[data-erro]")
    .textContent({ timeout: 15000 })
    .catch(() => null)
  await dialogo.locator("[data-campo-nome]").fill("rafael")
  await dialogo.locator("[data-campo-email]").fill("rafael")
  await botao.click()
  await pc.pagina
    .waitForFunction(
      () => document.querySelector("[data-erro]")?.textContent?.includes("Confere o e-mail"),
      null,
      { timeout: 15000 }
    )
    .catch(() => null)
  const erroDoEmail = await dialogo.locator("[data-erro]").textContent()
  const nomeFicou = await dialogo.locator("[data-campo-nome]").inputValue()
  ok(
    erroSemNome === "Faltou o seu nome." &&
      erroDoEmail?.includes("Confere o e-mail") &&
      nomeFicou === "rafael",
    "sem nome, e com e-mail torto: o erro de cada um, e o que foi digitado fica",
    JSON.stringify([erroSemNome, erroDoEmail, nomeFicou])
  )
  const E2 = novoEmail()
  await dialogo.locator("[data-campo-email]").fill(E2)
  await botao.click()
  const feito = await dialogo
    .locator('[data-feito="ok"]')
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  const codigo2 =
    (await dialogo
      .locator("[data-codigo]")
      .textContent()
      .catch(() => "")) ?? ""
  ok(
    feito &&
      CODIGO.test(codigo2) &&
      ((await dialogo.textContent()) ?? "").includes("Tá no seu e-mail, Rafael") &&
      (await cookieDe(pc.contexto, "fb_popup")) === "cadastrado" &&
      (await cookieDe(pc.contexto, "cupom")) === codigo2 &&
      Boolean(await esperarEmail(E2)),
    "cadastrou: o código na tela, o cupom guardado pro checkout e o e-mail na caixa",
    JSON.stringify({ codigo2, cupom: await cookieDe(pc.contexto, "cupom") })
  )
  await dialogo.getByRole("button", { name: "Continuar comprando" }).click()
  ok(await naoTem(pc.pagina), "“Continuar comprando” fecha o pop-up")

  // O checkout põe o cupom guardado na sacola.
  const sacola = await carrinhoCom("oleo-para-barba")
  await pc.contexto.addCookies([{ name: "carrinho", value: sacola, url: LOJA }])
  await pc.pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await pc.pagina.locator("h1, main").first().waitFor({ timeout: 60000 })
  let noCarrinho = []
  for (let i = 0; i < 20 && !noCarrinho.includes(codigo2); i++) {
    noCarrinho = await cuponsDoCarrinho(sacola)
    if (!noCarrinho.includes(codigo2)) await esperar(500)
  }
  ok(
    noCarrinho.includes(codigo2),
    "no checkout, o cupom entra sozinho na sacola",
    JSON.stringify(noCarrinho)
  )
  await pc.pagina.goto(`${LOJA}/produtos/balm-para-barba`, { waitUntil: "domcontentloaded" })
  await pc.pagina.locator("h1").first().waitFor({ timeout: 60000 })
  await passar(pc.pagina, 26000)
  ok(await naoTem(pc.pagina), "cadastrado, o pop-up não volta")

  /* ── 3. fechar, o mouse saindo, o Esc ───────────────────────────────────── */
  titulo("Fechar")
  const f = await novaPagina({ cookies: [JA_RESPONDEU] })
  await f.pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
  await f.pagina.locator("main").first().waitFor({ timeout: 60000 })
  await passar(f.pagina, 21000)
  const abriuSozinho = await apareceu(f.pagina)
  await f.pagina.locator(POPUP).getByRole("button", { name: "Agora não" }).click()
  const marca = (await cookieDe(f.contexto, "fb_popup")) ?? ""
  await f.pagina.reload({ waitUntil: "domcontentloaded" })
  await f.pagina.locator("main").first().waitFor({ timeout: 60000 })
  await passar(f.pagina, 26000)
  ok(
    abriuSozinho && /^fechado\.\d+$/.test(marca) && (await naoTem(f.pagina)),
    "“Agora não” fecha, e ele não volta (por 30 dias)",
    marca
  )
  const s = await novaPagina({ cookies: [JA_RESPONDEU] })
  await s.pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
  await s.pagina.locator("main").first().waitFor({ timeout: 60000 })
  await passar(s.pagina, 3000)
  await s.pagina.evaluate(() =>
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 0 }))
  )
  const naSaida = await apareceu(s.pagina)
  await s.pagina.keyboard.press("Escape")
  ok(
    naSaida && (await naoTem(s.pagina)),
    "o mouse saindo pra fechar a aba abre antes dos 20 segundos, e o Esc fecha"
  )

  /* ── 4. onde não aparece ───────────────────────────────────────────────── */
  titulo("Onde não aparece")
  const cliente = await novaPagina({ cookies: [JA_RESPONDEU, { name: "fb_cliente", value: "1" }] })
  await cliente.pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
  await cliente.pagina.locator("main").first().waitFor({ timeout: 60000 })
  await passar(cliente.pagina, 26000)
  const conta = await novaPagina({ cookies: [JA_RESPONDEU] })
  await conta.pagina.goto(`${LOJA}/conta`, { waitUntil: "domcontentloaded" })
  await conta.pagina.locator("main").first().waitFor({ timeout: 60000 })
  await passar(conta.pagina, 26000)
  ok(
    (await naoTem(cliente.pagina)) && (await naoTem(conta.pagina)),
    "quem já comprou neste navegador, e a página da conta: nada"
  )

  /* ── 5. no celular ─────────────────────────────────────────────────────── */
  titulo("No celular")
  const cel = await novaPagina({ celular: true, cookies: [JA_RESPONDEU] })
  await cel.pagina.goto(`${LOJA}/produtos/fator-de-crescimento-para-barba`, {
    waitUntil: "domcontentloaded",
  })
  await cel.pagina.locator("h1").first().waitFor({ timeout: 60000 })
  await passar(cel.pagina, 26000)
  const primeiraTela = await naoTem(cel.pagina)
  await cel.pagina.evaluate(() =>
    scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.6)
  )
  await passar(cel.pagina, 5000)
  const subiu = await apareceu(cel.pagina)
  const caixa = await cel.pagina.locator(POPUP).boundingBox()
  const xDoCel = await cel.pagina
    .locator(POPUP)
    .getByRole("button", { name: "Fechar" })
    .boundingBox()
  ok(
    primeiraTela &&
      subiu &&
      Boolean(caixa) &&
      Math.abs(caixa.y + caixa.height - 844) <= 2 &&
      caixa.y > 0 &&
      caixa.width >= 385 &&
      Boolean(xDoCel && xDoCel.y >= caixa.y && xDoCel.x + xDoCel.width <= 390),
    "no celular: a primeira tela livre; depois da rolagem, ele sobe de baixo, com o X à vista",
    JSON.stringify({ primeiraTela, caixa, xDoCel })
  )
} finally {
  if (desligou) await boasVindasLigado(true).catch(() => {})
  for (const c of abas) await c.close().catch(() => {})
  await navegador.close()
  await resend.fechar()
}

ok(
  noConsole.length === 0,
  "nenhum erro no console",
  [...new Set(noConsole.map((t) => t.split("\n")[0].slice(0, 160)))].slice(0, 3).join(" | ")
)

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
