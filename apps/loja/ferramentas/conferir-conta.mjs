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
 * saem do `.env.development.local` se faltarem), ADMIN_EMAIL e ADMIN_SENHA
 * (os pedidos) e CHROMIUM.
 *
 * Cria clientes de teste com e-mails que nunca se repetem
 * (`conta.<hora>.<n>@teste.fuckingbarba.dev`) — e esses ficam. Pra conferir
 * as telas de pedido, monta pedidos de verdade pra um deles, com a Frenet e
 * o Pagar.me falsos (`pedido-de-teste.mjs`), e usa o admin pra pagar,
 * postar, entregar e cancelar. No fim cancela os que ainda dá: os postados
 * ficam, e levam uma unidade de estoque cada.
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
 * │ • o e-mail do código com link (é o que golpe imita);                   │
 * │ • a conta mostrando pedido de outra pessoa — na lista, no detalhe, no  │
 * │   rastreio ou no "comprar de novo";                                    │
 * │ • o id do pedido passado pra minúscula no endereço (vira outro id);    │
 * │ • um estado de pedido com o rótulo, o total ou a linha do tempo        │
 * │   errados; o Pix pendente sem o código de verdade, ou a página que não │
 * │   muda sozinha quando ele cai.                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
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

/**
 * Só os e-mails de código contam aqui: quem tem pedido recebe também a
 * confirmação do pagamento e os do envio, e eles chegam quando querem
 * (são assíncronos). "Pedido #1234 confirmado" no lugar do código faria o
 * teste digitar o número do pedido.
 */
const deCodigo = (e) => /^\d{6} é o seu código/.test(e.subject ?? "")

async function esperarEmail(email, antes = 0, ms = 8000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const deste = resend.emails.filter((e) => e.to?.includes(email) && deCodigo(e))
    if (deste.length > antes) return deste.at(-1)
    await esperar(150)
  }
  return undefined
}
const quantosPara = (email) =>
  resend.emails.filter((e) => e.to?.includes(email) && deCodigo(e)).length

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

/**
 * Espera o React assumir o campo antes de digitar. Digitado antes, o valor
 * some quando a página hidrata (o campo é controlado e volta ao estado
 * dele, vazio), e o envio sai sem e-mail: a ação responde "Confere o
 * e-mail." em 0 ms e a tela do código nunca chega. Era a falha que ia e
 * vinha deste arquivo. O React marca cada elemento que assumiu com uma
 * propriedade `__reactProps$…`.
 */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s)].some((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps"))
      ),
    seletor,
    { timeout: 20000 }
  )
}

async function pedirPelaTela(pagina, email, url = "/conta/entrar") {
  await pagina.goto(LOJA + url)
  await hidratado(pagina, ".entrar input[name=email]")
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
  await hidratado(pagina, ".entrar input[name=email]")
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
  ok(h1 === "Visão geral", "entra na visão geral", h1)
  // O menu sai primeiro sem nome (a casca), e o nome chega do Medusa.
  await pagina
    .waitForFunction(
      () => window.__visivel("[data-conta-email]")?.textContent?.includes("@"),
      null,
      {
        timeout: 15000,
      }
    )
    .catch(() => null)
  const oi = (
    (await pagina.locator(".menu-conta__oi").filter({ visible: true }).textContent()) ?? ""
  ).trim()
  ok(oi === "Oi!", "conta nova, sem nome ainda: Oi!", oi)
  ok(
    ((await pagina.locator("[data-conta-email]").filter({ visible: true }).textContent()) ?? "") ===
      PRIMEIRO,
    "com o e-mail de quem entrou"
  )
  await pagina.locator(".conta-vazio").filter({ visible: true }).waitFor({ timeout: 15000 })
  ok(
    ((await pagina.locator(".conta-vazio").filter({ visible: true }).textContent()) ?? "").includes(
      "Nenhum pedido ainda"
    ),
    "e, sem compra nenhuma, o vazio com o caminho pra vitrine"
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
  await hidratado(pagina, ".entrar input[name=email]")
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

/* ── 12. os pedidos da conta ──────────────────────────────────────────────── */

/** Os e-mails de código de um endereço (o `deCodigo` lá de cima diz por quê). */
const codigosPara = (email) => resend.emails.filter((e) => e.to?.includes(email) && deCodigo(e))

/**
 * Entra pela tela com um e-mail que já pediu código — pro caso de a página
 * de partida ser outra que não o "entrar" (o `?para=`). Conta só os e-mails
 * de código: o de "pedido a caminho" pode chegar no meio (é assíncrono).
 */
async function entrarPelaTela(pagina, email, partida = "/conta/entrar") {
  const antes = codigosPara(email).length
  await pagina.goto(LOJA + partida)
  await pagina.waitForURL("**/conta/entrar**", { timeout: 15000 })
  await hidratado(pagina, ".entrar input[name=email]")
  await noBloco(pagina, "input[name=email]").fill(email)
  await noBloco(pagina, "form button[type=submit]").click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  await noBloco(pagina, "input[name=codigo]").waitFor({ timeout: 15000 })
  let codigo = null
  for (const fim = Date.now() + 8000; !codigo && Date.now() < fim; await esperar(150)) {
    const deste = codigosPara(email)
    if (deste.length > antes) codigo = deste.at(-1).subject.match(/^\d{6}/)[0]
  }
  await digitar(pagina, codigo ?? "")
  await pagina.waitForURL((u) => !u.pathname.startsWith("/conta/entrar"), { timeout: 20000 })
}

const visivel = (pagina, sel) => pagina.locator(sel).filter({ visible: true })
const textoDe = async (pagina, sel) =>
  (
    (await visivel(pagina, sel)
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  ).trim()

titulo("Os pedidos da conta")
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
const deixados = []
let pagarme = null
let frenet = null
let fabrica = null
if (!ADMIN_EMAIL || !ADMIN_SENHA) {
  ok(false, "montar pedidos de teste precisa de ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL)")
} else {
  frenet = await subirFrenetFalsa()
  pagarme = await subirPagarmeFalso({
    webhook: {
      url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
      segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
    },
  })
  const entrou = await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
  })
  const { token: tokenAdmin } = await entrou.json()
  fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })
}

if (fabrica) {
  const COMPRADOR = novoEmail()
  // Na ordem em que a vida acontece — o mais novo, no fim, é o do Pix.
  const entregue = await fabrica.pedidoPix(COMPRADOR, [["fator-de-crescimento-para-barba", 2]])
  await fabrica.pagar(entregue)
  await fabrica.entregar(entregue, await fabrica.enviar(entregue, { codigo: "JD0012345678" }))
  const enviado = await fabrica.pedidoPix(COMPRADOR, [
    ["kit-completo-para-barba", 1],
    ["balm-para-barba", 1],
  ])
  await fabrica.pagar(enviado)
  const URL_RASTREIO = "https://rastreamento.correios.com.br/app/index.php"
  await fabrica.enviar(enviado, { codigo: "QS123456789BR", url: URL_RASTREIO })
  const cancelado = await fabrica.pedidoPix(COMPRADOR, [
    ["spray-modelador-matte-100ml-fucking-barba", 1],
  ])
  await fabrica.cancelar(cancelado)
  const pago = await fabrica.pedidoPix(COMPRADOR, [["oleo-para-barba", 1]])
  await fabrica.pagar(pago)
  deixados.push(pago)
  const pix = await fabrica.pedidoPix(COMPRADOR, [
    ["shampoo-para-barba", 1],
    ["oleo-para-barba", 1],
  ])
  deixados.push(pix)
  const OUTRA_PESSOA = novoEmail()
  const deOutro = await fabrica.pedidoPix(OUTRA_PESSOA)
  deixados.push(deOutro)
  ok(
    true,
    `pedidos montados: #${entregue.numero} a #${pix.numero}, e o #${deOutro.numero} de outra pessoa`
  )

  /* ── o ?para= até um pedido, com o id intacto ── */
  const { contexto, pagina } = await novaAba()
  await entrarPelaTela(pagina, COMPRADOR, `/conta/pedidos/${enviado.id}`)
  ok(
    new URL(pagina.url()).pathname === `/conta/pedidos/${enviado.id}`,
    "sem sessão, o link de um pedido volta pra ELE depois do código — id com as maiúsculas",
    pagina.url()
  )
  await visivel(pagina, "h1#t-pedido").waitFor({ timeout: 15000 })
  ok(
    (await textoDe(pagina, "h1#t-pedido")) === `Pedido #${enviado.numero}`,
    "e abre o pedido certo",
    await textoDe(pagina, "h1#t-pedido")
  )

  /* ── a visão geral ── */
  titulo("A visão geral")
  await pagina.goto(`${LOJA}/conta`)
  await visivel(pagina, ".andamento__linha").first().waitFor({ timeout: 15000 })
  const linhas = await pagina.evaluate(() =>
    [...document.querySelectorAll(".andamento__linha")]
      .filter((e) => e.checkVisibility())
      .map((e) => ({ status: e.dataset.status, pedido: e.dataset.pedido }))
  )
  ok(
    linhas.map((l) => l.status).join(",") === "pix,pago,enviado",
    "em andamento: o Pix primeiro, depois do mais novo pro mais velho — sem o entregue e o cancelado",
    JSON.stringify(linhas)
  )
  ok(
    linhas[0]?.pedido === pix.id &&
      (await textoDe(pagina, ".andamento__linha[data-status=pix] .btn")) === "Pagar o Pix",
    "o do Pix leva pra pagar"
  )
  ok(
    (await textoDe(pagina, "[data-bloco-de-novo] .de-novo__txt")).includes(`#${enviado.numero}`),
    "comprar de novo sugere o último que saiu pra entrega",
    await textoDe(pagina, "[data-bloco-de-novo] .de-novo__txt")
  )
  await pagina
    .waitForFunction(() => window.__visivel("[data-conta-pedidos]")?.textContent === "5", null, {
      timeout: 10000,
    })
    .catch(() => null)
  ok((await textoDe(pagina, "[data-conta-pedidos]")) === "5", "o menu conta os cinco pedidos")

  /* ── a lista, contra o Medusa ── */
  titulo("A lista de pedidos")
  const token = (await sessaoDo(contexto))?.value
  const daApi = await medusa(
    "/store/orders?limit=50&order=-created_at&fields=id,display_id,status,total,original_total",
    { metodo: "GET", token }
  )
  const esperados = (daApi.corpo.orders ?? []).map((o) => ({
    id: o.id,
    total: Number(o.status === "canceled" ? o.original_total : o.total),
  }))
  await pagina.goto(`${LOJA}/conta/pedidos`)
  await visivel(pagina, "article.pedido-card").first().waitFor({ timeout: 15000 })
  const cartoes = await pagina.evaluate(() =>
    [...document.querySelectorAll("article.pedido-card")]
      .filter((e) => e.checkVisibility())
      .map((e) => ({
        id: e.dataset.pedido,
        status: e.querySelector(".status")?.textContent?.trim(),
        total: e.querySelector(".pedido-card__total")?.textContent?.trim(),
      }))
  )
  ok(
    cartoes.map((c) => c.id).join() ===
      [pix, pago, cancelado, enviado, entregue].map((p) => p.id).join(),
    "os cinco, do mais novo pro mais velho — e nenhum de outra pessoa",
    cartoes.map((c) => c.id.slice(-6)).join(",")
  )
  ok(
    cartoes.map((c) => c.status).join(",") ===
      "Aguardando Pix,Em separação,Cancelado,Enviado,Entregue",
    "cada um com o selo do estado dele",
    cartoes.map((c) => c.status).join(",")
  )
  const reais = (v) => `R$ ${v.toFixed(2).replace(".", ",")}`
  const totaisCertos = cartoes.every((c) => {
    const e = esperados.find((x) => x.id === c.id)
    return e && c.total.replace(/\s/g, " ") === reais(e.total)
  })
  ok(
    totaisCertos,
    "os totais são os do Medusa (o cancelado com o valor que tinha, e não zero)",
    cartoes.map((c) => c.total).join(" | ")
  )

  /* ── um pedido, em cada estado ── */
  titulo("Um pedido, em cada estado")
  const abrir = async (p) => {
    await pagina.goto(`${LOJA}/conta/pedidos/${p.id}`)
    await visivel(pagina, "h1#t-pedido").waitFor({ timeout: 15000 })
  }
  const marcas = () =>
    pagina.evaluate(() => {
      const lis = [...document.querySelectorAll(".linha-do-tempo li")].filter((e) =>
        e.checkVisibility()
      )
      return {
        feitos: lis.filter((l) => l.hasAttribute("data-feito")).length,
        agora: lis.findIndex((l) => l.hasAttribute("data-agora")),
      }
    })

  await abrir(enviado)
  ok(
    (await textoDe(pagina, ".rastreio__codigo")) === "QS123456789BR",
    "enviado: o código de rastreio"
  )
  ok(
    (await visivel(pagina, ".rastreio a").getAttribute("href")) === URL_RASTREIO,
    "e o link da transportadora"
  )
  let m = await marcas()
  ok(
    m.feitos === 3 && m.agora === 3,
    "a linha do tempo: três feitos, a entrega é a de agora",
    JSON.stringify(m)
  )

  await abrir(entregue)
  m = await marcas()
  ok(m.feitos === 4 && m.agora === -1, "entregue: os quatro feitos", JSON.stringify(m))
  ok((await visivel(pagina, ".ajuda a[href='/trocas']").count()) === 1, "e o caminho da troca")
  ok(
    (await textoDe(pagina, ".rastreio__codigo")) === "JD0012345678",
    "com o rastreio (etiqueta sem link: sem o botão de rastrear)"
  )
  ok((await visivel(pagina, ".rastreio a").count()) === 0, "o '#' do admin não vira link")

  await abrir(cancelado)
  ok(
    (await textoDe(pagina, ".cancelado b")) === "Pedido cancelado",
    "cancelado: o porquê no lugar da linha do tempo"
  )
  ok((await visivel(pagina, ".linha-do-tempo").count()) === 0, "sem linha do tempo")
  ok(
    (await textoDe(pagina, "#t-pagamento + .info")) === "Pix — venceu sem pagamento",
    "e o pagamento diz o que houve",
    await textoDe(pagina, "#t-pagamento + .info")
  )

  await abrir(pago)
  m = await marcas()
  ok(m.feitos === 2 && m.agora === 2, "em separação: o envio é o de agora", JSON.stringify(m))
  ok(
    (await textoDe(pagina, ".rastreio__depois")).startsWith("O código de rastreio aparece aqui"),
    "e o lugar do rastreio diz quando ele chega"
  )

  /* ── o Pix pendente, até cair ── */
  titulo("O Pix pendente, pela conta")
  // Com o token da conta dona: sem ele, o pedido vem na versão pública, sem o QR.
  const sessaoPix = (
    await medusa(`/store/orders/${pix.id}?fields=*payment_collections.payment_sessions`, {
      metodo: "GET",
      token,
    })
  ).corpo.order?.payment_collections?.[0]?.payment_sessions?.[0]?.data?.pagarme?.pix?.copiaECola
  await abrir(pix)
  ok(
    (await textoDe(pagina, ".feito__pix code")) === sessaoPix,
    "a caixa do Pix tem o código de verdade"
  )
  ok((await textoDe(pagina, "#t-pix")) === "Falta só o Pix", "com o título do obrigado")
  ok(
    (await visivel(pagina, "[data-comprar-de-novo]").count()) === 0,
    "e sem comprar de novo (ainda não comprou)"
  )
  await fabrica.pagar(pix)
  await visivel(pagina, ".status[data-status='pago']")
    .waitFor({ timeout: 30000 })
    .catch(() => null)
  ok(
    (await visivel(pagina, ".status[data-status='pago']").count()) === 1 &&
      (await visivel(pagina, ".feito__pix").count()) === 0,
    "o Pix cai e a página muda sozinha — sem o crachá do navegador de quem comprou"
  )

  /* ── de outra pessoa ── */
  titulo("Pedido de outra pessoa")
  await abrir(deOutro)
  ok(
    (await textoDe(pagina, "h1#t-pedido")) === "Não achei esse pedido",
    "o detalhe diz que não achou",
    await textoDe(pagina, "h1#t-pedido")
  )
  ok(
    !(await textoDe(pagina, ".area__miolo")).includes(`#${deOutro.numero}`),
    "sem mostrar nada dele"
  )
  const rastreioAlheio = await medusa(`/store/conta/pedidos/${deOutro.id}/rastreio`, {
    metodo: "GET",
    token,
  })
  ok(
    rastreioAlheio.status === 404,
    "o rastreio de pedido alheio responde 404",
    String(rastreioAlheio.status)
  )
  const rastreioSemToken = await medusa(`/store/conta/pedidos/${enviado.id}/rastreio`, {
    metodo: "GET",
  })
  ok(rastreioSemToken.status === 401, "e sem token, 401", String(rastreioSemToken.status))

  /*
    O PEDIDO PELO ID, NA API DO MEDUSA: inteiro pra conta dona; pra qualquer
    outra, a versão pública — número e situação, sem e-mail nem endereço.
  */
  const doDono = await medusa(`/store/orders/${pix.id}?fields=id,email,*shipping_address`, {
    metodo: "GET",
    token,
  })
  ok(
    doDono.status === 200 && doDono.corpo.order?.email === COMPRADOR,
    "pelo id, a conta dona lê o próprio pedido inteiro",
    `${doDono.status} ${JSON.stringify(doDono.corpo).slice(0, 120)}`
  )
  const alheio = await medusa(`/store/orders/${deOutro.id}?fields=id,email,*shipping_address`, {
    metodo: "GET",
    token,
  })
  const alheioTexto = JSON.stringify(alheio.corpo)
  ok(
    alheio.status === 200 &&
      alheio.corpo.order?.display_id === deOutro.numero &&
      !alheioTexto.includes(OUTRA_PESSOA) &&
      !alheioTexto.includes("Zimmermann"),
    "o de outra pessoa vem só com número e situação, mesmo com token de cliente",
    alheioTexto.slice(0, 160)
  )
  /*
    A TROCA DE DONO DO MEDUSA: qualquer conta pedia a transferência de
    qualquer pedido pelo id, e a resposta trazia o pedido inteiro. A loja não
    usa (os pedidos do convidado entram na conta pelo código), e a rota fecha.
  */
  const troca = await medusa(`/store/orders/${deOutro.id}/transfer/request`, {
    corpo: {},
    token,
  })
  const trocaTexto = JSON.stringify(troca.corpo)
  ok(
    troca.status === 400 &&
      troca.corpo.message === "Esta loja não usa esta rota." &&
      !trocaTexto.includes(OUTRA_PESSOA),
    "pedir a troca de dono de um pedido alheio não abre ele",
    `${troca.status} ${trocaTexto.slice(0, 160)}`
  )

  /* ── comprar de novo ── */
  titulo("Comprar de novo")
  await abrir(entregue)
  await visivel(pagina, "[data-comprar-de-novo]").click()
  await pagina
    .waitForFunction(() => document.documentElement.classList.contains("carrinho-aberto"), null, {
      timeout: 20000,
    })
    .catch(() => null)
  ok(
    await pagina.evaluate(() => document.documentElement.classList.contains("carrinho-aberto")),
    "a sacola abre com os itens"
  )
  ok(
    (await textoDe(pagina, ".de-novo__aviso")) === "2 itens voltaram pra sacola.",
    "e a frase diz quantos",
    await textoDe(pagina, ".de-novo__aviso")
  )
  const idCarrinho = (await contexto.cookies()).find((c) => c.name === "carrinho")?.value
  const carrinho = await medusa(`/store/carts/${idCarrinho}?fields=*items`, { metodo: "GET" })
  const itens = carrinho.corpo.cart?.items ?? []
  ok(
    itens.length === 1 &&
      itens[0].quantity === 2 &&
      /Fator de Crescimento/.test(itens[0].product_title ?? ""),
    "no carrinho do Medusa: o mesmo produto, na mesma quantidade",
    JSON.stringify(itens.map((i) => [i.product_title, i.quantity]))
  )
  await contexto.close()
}

/* ── 13. higiene ──────────────────────────────────────────────────────────── */

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))

// O que dá pra cancelar volta pro estoque. Os postados ficam.
for (const p of deixados) await fabrica?.cancelar(p).catch(() => null)

await navegador.close()
await resend.fechar()
await pagarme?.fechar?.()
await frenet?.fechar?.()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
