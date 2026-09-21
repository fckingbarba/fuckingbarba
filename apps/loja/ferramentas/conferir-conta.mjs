/**
 * CONFERIDOR DA CONTA — entrar com o código do e-mail, pela tela, com um
 * Resend de mentira atrás.
 *
 *   RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa npm run backend:dev
 *   npm run loja:dev
 *   node ferramentas/conferir-conta.mjs
 *
 * Variáveis: LOJA (padrão http://localhost:3000), MEDUSA_BACKEND_URL,
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY e REVALIDAR_SEGREDO (os dois últimos
 * saem do `.env.development.local` se faltarem) e CHROMIUM.
 *
 * Não escreve no admin. Cria clientes de teste com e-mails que nunca se
 * repetem (`conta.<hora>.<n>@teste.fuckingbarba.dev`) — e esses ficam.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • página da conta abrindo sem sessão, ou o "entrar" com sessão;        │
 * │ • o token do cliente ao alcance do JavaScript da página;               │
 * │ • código errado, vencido ou esgotado abrindo a conta;                  │
 * │ • o código servindo duas vezes, ou o velho valendo depois do novo;     │
 * │ • a segunda entrada criando outro cliente pro mesmo e-mail;            │
 * │ • quem comprou sem conta entrando numa conta VAZIA — o cliente         │
 * │   convidado do checkout tem que virar a conta, com o mesmo id;         │
 * │ • o "reenviar" mandando e-mail antes dos 30 segundos;                  │
 * │ • o `?para=` levando pra fora da loja depois do código;                │
 * │ • token recusado pelo Medusa prendendo a pessoa num vai e volta;       │
 * │ • cliente conseguindo conta com senha (`emailpass`), ou "cadastro"     │
 * │   sem provar o e-mail;                                                 │
 * │ • o limite por pessoa não segurando quem dispara código em série;      │
 * │ • o e-mail do código com link (é o que golpe imita).                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA =
  process.env.LOJA ??
  (process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"

function doEnv(nome) {
  if (process.env[nome]) return process.env[nome]
  try {
    const env = readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
    return env.match(new RegExp(`^${nome}=(.+)$`, "m"))?.[1]?.trim() ?? ""
  } catch {
    return ""
  }
}
const CHAVE = doEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY")
const SEGREDO_LOJA = doEnv("REVALIDAR_SEGREDO")

let falhas = 0
let testes = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const RODADA = Date.now().toString(36)
let n = 0
const novoEmail = () => `conta.${RODADA}.${++n}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >> 16) % 250}.${(Date.now() >> 8) % 250}.${Date.now() % 250}`

/* ── o Resend falso, e se o backend fala com ele ─────────────────────────── */

const resend = await subirResendFalso().catch((e) => {
  console.log(
    `  ⚠  não consegui subir o Resend falso na 4330 (${e.message}) — outro processo usando a porta?`
  )
  process.exit(1)
})
console.log(`  ⚙  Resend falso :${resend.porta}`)

async function medusa(caminho, { metodo = "POST", corpo, token, cabecalhos = {} } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...cabecalhos,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

async function esperarEmail(email, antes = 0, ms = 8000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const deste = resend.emails.filter((e) => e.to?.includes(email))
    if (deste.length > antes) return deste.at(-1)
    await esperar(150)
  }
  return undefined
}
const quantosPara = (email) => resend.emails.filter((e) => e.to?.includes(email)).length

{
  const sonda = novoEmail()
  const r = await medusa("/store/conta/codigo", { corpo: { email: sonda } })
  const chegou = r.status === 200 && (await esperarEmail(sonda, 0, 4000))
  if (!chegou) {
    console.log(
      `  ⚠  o backend não mandou o código pro Resend falso (resposta ${r.status}). Suba o Medusa com\n` +
        `     RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa npm run backend:dev`
    )
    await resend.fechar()
    process.exit(1)
  }
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const errosDeConsole = []
async function novaAba(viewport = { width: 1280, height: 900 }) {
  const contexto = await navegador.newContext({ viewport, extraHTTPHeaders: { "x-real-ip": IP } })
  /*
    O Next guarda as páginas visitadas no documento, escondidas (é o
    `<Activity>`), então um `querySelector` pode achar a cópia guardada de
    uma visita anterior. `__visivel` acha só a que está na tela.
  */
  await contexto.addInitScript(() => {
    window.__visivel = (sel) =>
      [...document.querySelectorAll(sel)].find((el) => el.checkVisibility()) ?? null
  })
  const pagina = await contexto.newPage()
  pagina.on("pageerror", (e) => errosDeConsole.push(e.message))
  pagina.on("console", (m) => {
    if (m.type() === "error") errosDeConsole.push(m.text())
  })
  return { contexto, pagina }
}

// O rodapé também tem um campo de e-mail (a newsletter): tudo aqui mira o bloco da conta.
const noBloco = (pagina, seletor) => pagina.locator(`.entrar ${seletor}`).filter({ visible: true })
const erroDoCampo = async (pagina) =>
  ((await noBloco(pagina, ".campo__erro").first().textContent()) ?? "").trim()

async function pedirPelaTela(pagina, email, url = "/conta/entrar") {
  await pagina.goto(LOJA + url)
  await noBloco(pagina, "input[name=email]").fill(email)
  await noBloco(pagina, "form button[type=submit]").click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  // O miolo chega depois da casca (é o `<Suspense>` que lê o cookie).
  await noBloco(pagina, "input[name=codigo]").waitFor({ timeout: 15000 })
}

async function digitar(pagina, codigo) {
  const campo = noBloco(pagina, "input[name=codigo]")
  await campo.fill("")
  await campo.pressSequentially(codigo, { delay: 30 })
}

/**
 * Uma tentativa, esperando a resposta. Cada resposta remonta o campo (ver a
 * `key` em `components/conta/codigo.tsx`), então "respondeu" é o campo de
 * antes ter saído do documento — ou a página ter saído do código.
 */
async function tentar(pagina, codigo) {
  await pagina.evaluate(() => {
    window.__campoAntes = window.__visivel(".entrar input[name=codigo]")
  })
  await digitar(pagina, codigo)
  await pagina
    .waitForFunction(
      () => location.pathname !== "/conta/entrar/codigo" || !window.__campoAntes?.isConnected,
      null,
      { timeout: 15000 }
    )
    .catch(() => null)
}

/** Espera o recado do campo aparecer (ou mudar). */
async function esperarRecado(pagina) {
  await pagina
    .waitForFunction(
      () => (window.__visivel(".entrar .campo__erro")?.textContent ?? "") !== "",
      null,
      {
        timeout: 15000,
      }
    )
    .catch(() => null)
}

async function sessaoDo(contexto) {
  return (await contexto.cookies()).find((c) => c.name === "sessao")
}

/* ── 1. a porta ───────────────────────────────────────────────────────────── */

titulo("A porta da /conta")
{
  const sem = await fetch(`${LOJA}/conta`, { redirect: "manual" })
  ok(
    sem.status === 307 &&
      new URL(sem.headers.get("location") ?? "", LOJA).pathname === "/conta/entrar",
    "sem sessão, /conta vira o entrar",
    `${sem.status} ${sem.headers.get("location")}`
  )
  const funda = await fetch(`${LOJA}/conta/pedidos`, { redirect: "manual" })
  ok(
    new URL(funda.headers.get("location") ?? "", LOJA).search === "?para=%2Fconta%2Fpedidos",
    "e lembra pra onde a pessoa ia (?para=)",
    funda.headers.get("location") ?? ""
  )
  const entrar = await fetch(`${LOJA}/conta/entrar`, { redirect: "manual" })
  ok(entrar.status === 200, "o entrar abre sem sessão", String(entrar.status))

  const { contexto, pagina } = await novaAba()
  await pagina.goto(`${LOJA}/conta/entrar/codigo`)
  await pagina.waitForURL("**/conta/entrar", { timeout: 15000 }).catch(() => null)
  ok(
    new URL(pagina.url()).pathname === "/conta/entrar",
    "a tela do código, sem código pedido, volta pro e-mail",
    pagina.url()
  )
  await contexto.close()
}

/* ── 2. entrar pela primeira vez ─────────────────────────────────────────── */

titulo("Entrar pela primeira vez")
const PRIMEIRO = novoEmail()
let clienteDoPrimeiro = ""
{
  const { contexto, pagina } = await novaAba()
  await pagina.goto(`${LOJA}/conta`)
  await pagina.waitForURL("**/conta/entrar", { timeout: 15000 })
  await noBloco(pagina, "input[name=email]").fill("rafael@")
  await noBloco(pagina, "form button[type=submit]").click()
  await esperarRecado(pagina)
  ok(
    (await erroDoCampo(pagina)) === "Confere o e-mail.",
    "e-mail sem forma de e-mail: recado no campo"
  )

  await noBloco(pagina, "input[name=email]").fill(PRIMEIRO.toUpperCase())
  await noBloco(pagina, "form button[type=submit]").click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  await noBloco(pagina, ".entrar__txt b").waitFor({ timeout: 15000 })
  const texto = (await noBloco(pagina, ".entrar__txt").textContent()) ?? ""
  ok(texto.includes(PRIMEIRO), "a tela do código mostra o e-mail INTEIRO (e em minúscula)", texto)
  const reenviar = noBloco(pagina, ".codigo__reenviar button")
  ok(await reenviar.isDisabled(), "o reenviar começa travado")
  ok(
    /reenvie em 0:(2\d|30)/.test((await reenviar.textContent()) ?? ""),
    "com a contagem dos 30 segundos",
    (await reenviar.textContent()) ?? ""
  )

  const email = await esperarEmail(PRIMEIRO)
  const codigo = email?.subject?.match(/\b\d{6}\b/)?.[0]
  ok(Boolean(codigo), "o código chegou, no assunto", email?.subject ?? "nenhum e-mail")
  ok(Boolean(email?.text?.includes(codigo ?? "x")), "e no texto do e-mail")
  ok(!/<a[\s>]/i.test(email?.html ?? ""), "o e-mail não tem link nenhum")
  ok(Boolean(email?.from), "com remetente", email?.from ?? "")

  const errado = codigo === "000000" ? "111111" : "000000"
  await tentar(pagina, errado)
  ok(
    (await erroDoCampo(pagina)) === "Código errado. Confere e tenta de novo.",
    "código errado: recado",
    await erroDoCampo(pagina)
  )
  const campoDepois = await pagina.evaluate(() => {
    const i = window.__visivel(".entrar input[name=codigo]")
    return { vazio: i?.value === "", foco: document.activeElement === i }
  })
  ok(
    campoDepois.vazio && campoDepois.foco,
    "e o campo volta vazio, com o cursor",
    JSON.stringify(campoDepois)
  )

  await digitar(pagina, codigo)
  await pagina.waitForURL(`${LOJA}/conta`, { timeout: 20000 })
  ok(true, "o código certo entra sozinho no sexto dígito")
  const h1 = (
    (await pagina.locator("h1").filter({ visible: true }).first().textContent()) ?? ""
  ).trim()
  ok(h1 === "Oi!", "conta nova, sem nome ainda: Oi!", h1)
  ok(
    ((await pagina.locator("[data-conta-email]").textContent()) ?? "") === PRIMEIRO,
    "com o e-mail de quem entrou"
  )

  const cookies = await contexto.cookies()
  const sessao = cookies.find((c) => c.name === "sessao")
  ok(Boolean(sessao?.httpOnly), "o token mora num cookie httpOnly")
  ok(sessao?.sameSite === "Lax", "sameSite=Lax", sessao?.sameSite ?? "")
  ok(!cookies.some((c) => c.name === "entrando"), "o cookie do meio do caminho some")
  ok(
    (await pagina.evaluate(() => document.cookie)).indexOf("sessao") === -1,
    "e o JavaScript da página não enxerga o token"
  )

  const eu = await medusa("/store/customers/me", { metodo: "GET", token: sessao?.value })
  clienteDoPrimeiro = eu.corpo.customer?.id ?? ""
  ok(
    eu.corpo.customer?.email === PRIMEIRO && eu.corpo.customer?.has_account === true,
    "no Medusa: cliente com conta, com esse e-mail",
    JSON.stringify(eu.corpo).slice(0, 120)
  )

  const reuso = await medusa("/auth/customer/codigo", { corpo: { email: PRIMEIRO, codigo } })
  ok(reuso.status === 401, "o mesmo código não serve duas vezes", String(reuso.status))

  await pagina.goto(`${LOJA}/conta/entrar`)
  ok(new URL(pagina.url()).pathname === "/conta", "com sessão, o entrar vira a conta", pagina.url())

  await pagina.locator("button", { hasText: "Sair" }).filter({ visible: true }).click()
  await pagina.waitForURL("**/conta/entrar?saiu=1", { timeout: 15000 })
  ok(
    ((await noBloco(pagina, ".entrar__recado").textContent()) ?? "").includes("saiu"),
    "sair: volta pro entrar, com o recado"
  )
  ok(!(await sessaoDo(contexto))?.value, "e o cookie da sessão foi embora")
  await pagina.goto(`${LOJA}/conta`)
  ok(new URL(pagina.url()).pathname === "/conta/entrar", "e a conta fechou", pagina.url())
  await contexto.close()
}

/* ── 3. a segunda vez ─────────────────────────────────────────────────────── */

titulo("A segunda vez")
{
  const { contexto, pagina } = await novaAba()
  const antes = quantosPara(PRIMEIRO)
  await pedirPelaTela(pagina, PRIMEIRO)
  const codigo = (await esperarEmail(PRIMEIRO, antes))?.subject?.match(/\b\d{6}\b/)?.[0]
  await digitar(pagina, codigo)
  await pagina.waitForURL(`${LOJA}/conta`, { timeout: 20000 })
  const eu = await medusa("/store/customers/me", {
    metodo: "GET",
    token: (await sessaoDo(contexto))?.value,
  })
  ok(
    eu.corpo.customer?.id === clienteDoPrimeiro,
    "o mesmo cliente — nada de conta duplicada",
    `${eu.corpo.customer?.id} ≠ ${clienteDoPrimeiro}`
  )
  await contexto.close()
}

/* ── 4. quem comprou sem conta ────────────────────────────────────────────── */

titulo("Quem comprou sem conta")
{
  const CONVIDADO = novoEmail()
  const { corpo } = await medusa("/store/regions", { metodo: "GET" })
  const carrinho = await medusa("/store/carts", {
    corpo: { region_id: corpo.regions?.[0]?.id, email: CONVIDADO },
  })
  const convidado = carrinho.corpo.cart?.customer_id
  ok(
    Boolean(convidado),
    "o checkout cria o cliente convidado",
    JSON.stringify(carrinho.corpo).slice(0, 100)
  )

  const { contexto, pagina } = await novaAba({ width: 390, height: 844 })
  await pedirPelaTela(pagina, CONVIDADO)
  const codigo = (await esperarEmail(CONVIDADO))?.subject?.match(/\b\d{6}\b/)?.[0]
  await digitar(pagina, codigo)
  await pagina.waitForURL(`${LOJA}/conta`, { timeout: 20000 })
  const eu = await medusa("/store/customers/me", {
    metodo: "GET",
    token: (await sessaoDo(contexto))?.value,
  })
  ok(
    eu.corpo.customer?.id === convidado,
    "o convidado VIRA a conta (mesmo id) — os pedidos dele vêm junto",
    `${eu.corpo.customer?.id} ≠ ${convidado}`
  )
  ok(eu.corpo.customer?.has_account === true, "e passa a ter conta")
  await contexto.close()
}

/* ── 5. cinco erros ───────────────────────────────────────────────────────── */

titulo("Cinco erros")
{
  const EMAIL = novoEmail()
  const { contexto, pagina } = await novaAba()
  await pedirPelaTela(pagina, EMAIL)
  const codigo = (await esperarEmail(EMAIL))?.subject?.match(/\b\d{6}\b/)?.[0]
  const errados = ["000001", "000002", "000003", "000004", "000005"].filter((c) => c !== codigo)
  for (const c of errados.slice(0, 4)) await tentar(pagina, c)
  ok(
    (await erroDoCampo(pagina)).startsWith("Código errado"),
    "até a quarta: código errado",
    await erroDoCampo(pagina)
  )
  await tentar(pagina, errados[4])
  ok(
    (await erroDoCampo(pagina)).startsWith("Muitas tentativas"),
    "a quinta já diz que acabou",
    await erroDoCampo(pagina)
  )
  ok(
    await noBloco(pagina, ".codigo__reenviar[data-destaque]").isVisible(),
    "e o reenviar vira a saída, em destaque"
  )
  await tentar(pagina, codigo)
  ok(
    new URL(pagina.url()).pathname === "/conta/entrar/codigo",
    "nem o código certo entra depois disso",
    pagina.url()
  )
  ok(
    (await erroDoCampo(pagina)).startsWith("Muitas tentativas"),
    "e o recado continua o mesmo",
    await erroDoCampo(pagina)
  )
  await contexto.close()
}

/* ── 6. espera e reenvio ──────────────────────────────────────────────────── */

titulo("Pedir de novo, e reenviar")
{
  const EMAIL = novoEmail()
  const { contexto, pagina } = await novaAba()
  await pedirPelaTela(pagina, EMAIL)
  const primeiro = (await esperarEmail(EMAIL))?.subject?.match(/\b\d{6}\b/)?.[0]

  await pagina
    .locator(".entrar a.link", { hasText: "Trocar e-mail" })
    .filter({ visible: true })
    .click()
  await pagina.waitForURL("**/conta/entrar", { timeout: 15000 })
  ok(
    (await noBloco(pagina, "input[name=email]").inputValue()) === EMAIL,
    "trocar e-mail volta com o e-mail digitado"
  )
  await noBloco(pagina, "form button[type=submit]").click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  await noBloco(pagina, "input[name=codigo]").waitFor({ timeout: 15000 })
  await esperar(1500)
  ok(
    quantosPara(EMAIL) === 1,
    "pedir de novo antes dos 30 s leva pro código que já foi — sem outro e-mail",
    `${quantosPara(EMAIL)} e-mails`
  )
  const contagem = (await noBloco(pagina, ".codigo__reenviar button").textContent()) ?? ""
  const faltam = Number(contagem.match(/0:(\d\d)/)?.[1] ?? 99)
  ok(faltam < 30, "e a contagem segue de onde estava", contagem)

  await pagina.waitForFunction(
    () => window.__visivel(".entrar .codigo__reenviar button")?.disabled === false,
    null,
    { timeout: 40000 }
  )
  await noBloco(pagina, ".codigo__reenviar button").click()
  const segundo = (await esperarEmail(EMAIL, 1))?.subject?.match(/\b\d{6}\b/)?.[0]
  ok(Boolean(segundo), "passados os 30 s, o reenviar manda outro código")
  await pagina
    .waitForFunction(
      () => (window.__visivel(".entrar .codigo__aviso")?.textContent ?? "") !== "",
      null,
      {
        timeout: 10000,
      }
    )
    .catch(() => null)
  ok(
    ((await noBloco(pagina, ".codigo__aviso").textContent()) ?? "").startsWith(
      "Código novo enviado"
    ),
    "e avisa"
  )

  if (primeiro !== segundo) {
    await tentar(pagina, primeiro)
    ok(
      new URL(pagina.url()).pathname === "/conta/entrar/codigo",
      "o código velho não vale mais",
      pagina.url()
    )
  }
  await digitar(pagina, segundo)
  await pagina.waitForURL(`${LOJA}/conta`, { timeout: 20000 })
  ok(true, "o novo vale")
  await contexto.close()
}

/* ── 7. o e-mail que não sai ──────────────────────────────────────────────── */

titulo("Quando o e-mail não sai")
{
  const { contexto, pagina } = await novaAba()
  resend.roteiro.cair = true
  await pagina.goto(`${LOJA}/conta/entrar`)
  await noBloco(pagina, "input[name=email]").fill(novoEmail())
  await noBloco(pagina, "form button[type=submit]").click()
  await esperarRecado(pagina)
  resend.roteiro.cair = false
  ok(
    (await erroDoCampo(pagina)).startsWith("Não conseguimos mandar o e-mail"),
    "a tela diz que não mandou, em vez de fingir",
    await erroDoCampo(pagina)
  )
  ok(
    new URL(pagina.url()).pathname === "/conta/entrar",
    "e não leva pra tela do código",
    pagina.url()
  )
  await contexto.close()
}

/* ── 8. para onde volta ───────────────────────────────────────────────────── */

titulo("Pra onde volta depois do código")
{
  const EMAIL = novoEmail()
  const { contexto, pagina } = await novaAba()
  await pedirPelaTela(pagina, EMAIL, "/conta/entrar?para=https%3A%2F%2Fgolpe.example%2Fconta")
  const codigo = (await esperarEmail(EMAIL))?.subject?.match(/\b\d{6}\b/)?.[0]
  await digitar(pagina, codigo)
  await pagina.waitForURL((u) => !u.pathname.startsWith("/conta/entrar"), { timeout: 20000 })
  ok(pagina.url() === `${LOJA}/conta`, "?para= de fora da loja vira /conta", pagina.url())
  await contexto.close()
}

/* ── 9. token recusado ────────────────────────────────────────────────────── */

titulo("Token que o Medusa recusa")
{
  const { contexto, pagina } = await novaAba()
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const forjado = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    actor_id: "cus_forjado",
    actor_type: "customer",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.assinatura-falsa`
  await contexto.addCookies([{ name: "sessao", value: forjado, url: LOJA }])
  await pagina.goto(`${LOJA}/conta`)
  await pagina.waitForURL("**/conta/entrar?motivo=expirou", { timeout: 20000 }).catch(() => null)
  ok(
    pagina.url().endsWith("/conta/entrar?motivo=expirou"),
    "a conta manda pro entrar, sem vai e volta",
    pagina.url()
  )
  ok(
    (
      (await noBloco(pagina, ".entrar__recado")
        .textContent()
        .catch(() => "")) ?? ""
    ).includes("sessão acabou"),
    "com o recado"
  )
  ok(!(await sessaoDo(contexto))?.value, "e o cookie forjado foi apagado")
  await contexto.close()
}

/* ── 10. as portas da API ─────────────────────────────────────────────────── */

titulo("As portas da API")
{
  const senha = await medusa("/auth/customer/emailpass/register", {
    corpo: { email: novoEmail(), password: "senha-teste-123" },
  })
  ok(
    senha.status === 400,
    "cliente não cria conta com senha (emailpass)",
    `${senha.status} ${senha.corpo.message}`
  )
  const cadastro = await medusa("/auth/customer/codigo/register", { corpo: { email: novoEmail() } })
  ok(
    cadastro.status === 401,
    "o provedor do código não tem cadastro",
    `${cadastro.status} ${cadastro.corpo.message}`
  )
  const semToken = await medusa("/store/conta/vincular")
  ok(semToken.status === 401, "vincular sem token: 401", String(semToken.status))
  const semCodigo = await medusa("/auth/customer/codigo", {
    corpo: { email: novoEmail(), codigo: "123456" },
  })
  ok(
    semCodigo.status === 401 && semCodigo.corpo.message === "codigo_errado",
    "e-mail sem código pedido responde igual a código errado",
    `${semCodigo.status} ${semCodigo.corpo.message}`
  )
}

/* ── 11. o limite por pessoa ──────────────────────────────────────────────── */

titulo("O limite por pessoa")
if (!SEGREDO_LOJA) {
  console.log("  ⚠  sem REVALIDAR_SEGREDO — não dá pra assinar o IP; pulando")
} else {
  const ipDaRajada = `10.251.${(Date.now() >> 8) % 250}.${Date.now() % 250}`
  const cabecalhos = { "x-cliente-ip": ipDaRajada, "x-loja-segredo": SEGREDO_LOJA }
  const respostas = []
  for (let i = 0; i < 11; i++) {
    respostas.push(
      (await medusa("/store/conta/codigo", { corpo: { email: novoEmail() }, cabecalhos })).status
    )
  }
  ok(
    respostas.slice(0, 10).every((s) => s === 200),
    "dez códigos por hora pro mesmo IP",
    respostas.join(",")
  )
  ok(respostas[10] === 429, "o décimo primeiro, não", respostas.join(","))
  const outro = await medusa("/store/conta/codigo", {
    corpo: { email: novoEmail() },
    cabecalhos: { ...cabecalhos, "x-cliente-ip": `${ipDaRajada}9` },
  })
  ok(outro.status === 200, "outro IP segue podendo", String(outro.status))
}

/* ── 12. higiene ──────────────────────────────────────────────────────────── */

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))

await navegador.close()
await resend.fechar()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
