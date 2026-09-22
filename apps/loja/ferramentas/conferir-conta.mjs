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
 * │   muda sozinha quando ele cai;                                         │
 * │ • endereço salvo sem o número e o bairro separados, dois principais,   │
 * │   ou nenhum depois de excluir o principal;                             │
 * │ • o formulário de endereço mandando os campos escondidos;              │
 * │ • meus dados aceitando CPF errado, ou a oferta nascendo marcada;       │
 * │ • o checkout de quem está na conta abrindo vazio, ou o pedido nascendo │
 * │   fora dela; a compra não deixando o endereço na conta — ou a compra   │
 * │   SEM a conta aberta escrevendo na conta de quem tem aquele e-mail;    │
 * │ • sair deixando a sacola da conta pra próxima pessoa do navegador;     │
 * │ • o "Minha conta" do cabeçalho voltando pro /em-breve.                 │
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
  // O e-mail chega com o miolo, que lê o cookie dentro de um `<Suspense>`:
  // no `next start` a casca (campo vazio) aparece antes dele.
  await pagina
    .waitForFunction((e) => window.__visivel(".entrar input[name=email]")?.value === e, EMAIL, {
      timeout: 10000,
    })
    .catch(() => null)
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

/* ── 13. a parte 3: quem entra por aqui ───────────────────────────────────── */

/*
  As telas da parte 3 não precisam passar pelo código de novo — o entrar já
  foi conferido lá em cima. O token sai pela API (o mesmo caminho: código no
  Resend falso, vincular, refresh) e vai direto pro cookie `sessao`.

  UM IP INVENTADO SÓ PRA ISTO, assinado como a loja assina: as seções de
  cima já gastam perto dos dez códigos por hora do IP da rodada, e o
  décimo primeiro seria um 429 que não tem nada a ver com endereço.
*/
const IP_DA_PARTE_3 = `10.253.${(Date.now() >> 9) % 250}.${(Date.now() >> 1) % 250}`

async function tokenPorApi(email) {
  const antes = codigosPara(email).length
  const pedido = await medusa("/store/conta/codigo", {
    corpo: { email },
    cabecalhos: SEGREDO_LOJA
      ? { "x-cliente-ip": IP_DA_PARTE_3, "x-loja-segredo": SEGREDO_LOJA }
      : {},
  })
  if (pedido.status !== 200) return null
  let codigo = null
  for (const fim = Date.now() + 8000; !codigo && Date.now() < fim; await esperar(150)) {
    const deste = codigosPara(email)
    if (deste.length > antes) codigo = deste.at(-1).subject.match(/^\d{6}/)[0]
  }
  let token = (await medusa("/auth/customer/codigo", { corpo: { email, codigo } })).corpo.token
  if (!token) return null
  const conteudo = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
  if (!conteudo.actor_id) {
    await medusa("/store/conta/vincular", { token })
    token = (await medusa("/auth/token/refresh", { token })).corpo.token
  }
  return token ?? null
}

async function abaNaConta(token, viewport) {
  const aba = await novaAba(viewport)
  if (token) await aba.contexto.addCookies([{ name: "sessao", value: token, url: LOJA }])
  return aba
}

const CAMPOS_DO_CLIENTE = "id,email,first_name,last_name,phone,metadata,*addresses"
const doCliente = async (token) =>
  (
    await medusa(`/store/customers/me?fields=${encodeURIComponent(CAMPOS_DO_CLIENTE)}`, {
      metodo: "GET",
      token,
    })
  ).corpo.customer ?? {}

/** Espera o aviso que sobe de baixo dizer isto (o da página da vez, não o guardado). */
async function esperarAviso(pagina, texto) {
  await pagina
    .waitForFunction(
      (t) => window.__visivel("[data-conta-aviso]:not([data-fora])")?.textContent === t,
      texto,
      { timeout: 20000 }
    )
    .catch(() => null)
  return (await textoDe(pagina, "[data-conta-aviso]:not([data-fora])")) === texto
}

const focado = (pagina) =>
  pagina.evaluate(() => {
    const el = document.activeElement
    return {
      nome: el?.getAttribute("name") ?? "",
      texto: el?.textContent?.trim() ?? "",
      editar: el?.getAttribute("data-editar-endereco") ?? "",
    }
  })

/* ── 14. os endereços ─────────────────────────────────────────────────────── */

titulo("Os endereços")
const DONO = novoEmail()
const tokenDono = await tokenPorApi(DONO)
ok(Boolean(tokenDono), "entra por API pra conferir as telas da parte 3", DONO)
if (tokenDono) {
  const { contexto, pagina } = await abaNaConta(tokenDono)
  await pagina.goto(`${LOJA}/conta/enderecos`)
  await hidratado(pagina, "[data-novo-endereco]")
  ok(
    (await visivel(pagina, "article[data-endereco]").count()) === 0 &&
      (await visivel(pagina, "[data-novo-endereco]").count()) === 1,
    "conta nova: nenhum endereço, só o Adicionar"
  )

  const form = () => visivel(pagina, "form[data-form-endereco]")
  const campo = (nome) => form().locator(`[name="${nome}"]`)

  /* ── um novo, pelo CEP ── */
  await visivel(pagina, "[data-novo-endereco]").click()
  await form().waitFor({ timeout: 10000 })
  ok(await form().locator(".endereco__resto").isHidden(), "o formulário novo mostra só o CEP")
  ok((await focado(pagina)).nome === "cep", "com o cursor nele")

  await campo("cep").fill("0131")
  await form().locator("button[type=submit]").click()
  ok(
    (await textoDe(pagina, "form[data-form-endereco] .campo__erro")) === "CEP tem 8 dígitos.",
    "salvar com o CEP pela metade: o recado no CEP — e não nos campos escondidos",
    await textoDe(pagina, "form[data-form-endereco] .campo__erro")
  )

  await campo("cep").fill("")
  await campo("cep").pressSequentially("01310100", { delay: 30 })
  await pagina.waitForFunction(
    () => window.__visivel("form[data-form-endereco] [name=rua]")?.value?.length > 0,
    null,
    { timeout: 20000 }
  )
  ok((await campo("rua").inputValue()) === "Avenida Paulista", "o CEP preenche a rua")
  ok((await campo("uf").inputValue()) === "SP", "e o estado")
  await pagina
    .waitForFunction(() => document.activeElement?.getAttribute("name") === "numero", null, {
      timeout: 5000,
    })
    .catch(() => null)
  ok((await focado(pagina)).nome === "numero", "e o cursor pula pro número")
  ok(
    (await campo("principal").count()) === 0,
    "o primeiro endereço nem pergunta se é o principal — ele é"
  )

  await form().locator("button[type=submit]").click()
  await pagina
    .waitForFunction(
      () => /Falta o número/.test(window.__visivel("form[data-form-endereco]")?.textContent ?? ""),
      null,
      { timeout: 15000 }
    )
    .catch(() => null)
  ok(
    ((await form().textContent()) ?? "").includes("Falta o número. Se não tem, escreve S/N."),
    "sem número: o recado no número (a frase do checkout)"
  )
  ok((await doCliente(tokenDono)).addresses?.length === 0, "e nada foi gravado")

  await campo("numero").fill("1578")
  await campo("complemento").fill("Apto 12")
  await campo("apelido").fill("Casa")
  await form().locator("button[type=submit]").click()
  await visivel(pagina, "article[data-endereco]").first().waitFor({ timeout: 20000 })
  ok(await esperarAviso(pagina, "Endereço salvo."), "salvou: o aviso sobe")
  await pagina
    .waitForFunction(() => document.activeElement?.hasAttribute("data-editar-endereco"), null, {
      timeout: 5000,
    })
    .catch(() => null)
  const depoisDeSalvar = await focado(pagina)

  let conta = await doCliente(tokenDono)
  const casa = conta.addresses?.[0]
  ok(
    conta.addresses?.length === 1 &&
      casa.is_default_shipping === true &&
      casa.address_name === "Casa" &&
      casa.postal_code === "01310100" &&
      casa.metadata?.rua === "Avenida Paulista" &&
      casa.metadata?.numero === "1578" &&
      casa.metadata?.complemento === "Apto 12" &&
      casa.metadata?.bairro === "Bela Vista",
    "no Medusa: principal, com rua, número, complemento e bairro separados (o que a nota e a cotação leem)",
    JSON.stringify(casa)
  )
  ok(
    !casa?.first_name && !casa?.last_name && !casa?.phone,
    "sem nome nem telefone no endereço: quem recebe é o dono da conta"
  )
  ok(
    depoisDeSalvar.editar === casa?.id,
    "e o foco volta pro Editar do cartão salvo",
    JSON.stringify(depoisDeSalvar)
  )
  ok(
    (await visivel(pagina, `article[data-endereco="${casa?.id}"] .selo--principal`).count()) === 1,
    "o cartão diz que ele é o principal"
  )
  await pagina
    .waitForFunction(() => window.__visivel("[data-conta-enderecos]")?.textContent === "1", null, {
      timeout: 10000,
    })
    .catch(() => null)
  ok((await textoDe(pagina, "[data-conta-enderecos]")) === "1", "e o menu conta um endereço")

  /* ── outro, à mão, e principal ── */
  await visivel(pagina, "[data-novo-endereco]").click()
  await form().waitFor({ timeout: 10000 })
  await campo("cep").pressSequentially("99999999", { delay: 30 })
  await pagina
    .waitForFunction(
      () => /Não achei esse CEP/.test(window.__visivel(".endereco__busca")?.textContent ?? ""),
      null,
      { timeout: 20000 }
    )
    .catch(() => null)
  ok(
    (await textoDe(pagina, ".endereco__busca")) ===
      "Não achei esse CEP. Preenche à mão que funciona igual.",
    "CEP que ninguém conhece: o recado, e os campos abrem vazios pra preencher à mão"
  )
  ok(
    (await campo("rua").inputValue()) === "" && (await focado(pagina)).nome === "rua",
    "com o cursor na rua"
  )
  await campo("rua").fill("Rua das Palmeiras")
  await campo("numero").fill("S/N")
  await campo("bairro").fill("Centro")
  await campo("cidade").fill("Pomerode")
  await campo("uf").selectOption("SC")
  await campo("apelido").fill("Trabalho")
  ok(
    await campo("principal").isVisible(),
    "com um endereço já salvo, pergunta se este vira o principal"
  )
  await campo("principal").check()
  await form().locator("button[type=submit]").click()
  await pagina
    .waitForFunction(() => document.querySelectorAll("article[data-endereco]").length >= 2, null, {
      timeout: 20000,
    })
    .catch(() => null)
  ok(await esperarAviso(pagina, "Endereço salvo."), "salvou o segundo")

  conta = await doCliente(tokenDono)
  const trabalho = conta.addresses?.find((a) => a.address_name === "Trabalho")
  ok(
    trabalho?.is_default_shipping === true &&
      conta.addresses.find((a) => a.id === casa?.id)?.is_default_shipping === false,
    "o novo virou o principal, e o de antes deixou de ser — um só",
    JSON.stringify(conta.addresses?.map((a) => [a.address_name, a.is_default_shipping]))
  )
  const ordem = await pagina.evaluate(() =>
    [...document.querySelectorAll("article[data-endereco]")]
      .filter((e) => e.checkVisibility())
      .map((e) => e.dataset.endereco)
  )
  ok(ordem[0] === trabalho?.id, "e o principal vem primeiro na lista", JSON.stringify(ordem))

  /* ── editar ── */
  await visivel(pagina, `[data-editar-endereco="${casa?.id}"]`).click()
  await form().waitFor({ timeout: 10000 })
  ok(
    (await campo("numero").inputValue()) === "1578" &&
      (await campo("complemento").inputValue()) === "Apto 12" &&
      (await form().locator(".endereco__resto").isVisible()),
    "editar abre tudo, preenchido"
  )
  ok(
    (await visivel(pagina, `article[data-endereco="${casa?.id}"]`).count()) === 0,
    "no lugar do cartão (e não lá embaixo, longe dele)"
  )
  await campo("complemento").fill("Apto 34")
  await form().locator("button[type=submit]").click()
  ok(await esperarAviso(pagina, "Endereço atualizado."), "editou: o aviso diz atualizado")
  conta = await doCliente(tokenDono)
  const casaDepois = conta.addresses?.find((a) => a.id === casa?.id)
  ok(
    casaDepois?.metadata?.complemento === "Apto 34" && casaDepois?.is_default_shipping === false,
    "no Medusa, o complemento novo — e editar não mexeu em quem é o principal",
    JSON.stringify(casaDepois)
  )

  /* ── tornar principal ── */
  await visivel(pagina, `[data-principal-endereco="${casa?.id}"]`).click()
  ok(await esperarAviso(pagina, "Endereço principal trocado."), "tornar principal: o aviso")
  conta = await doCliente(tokenDono)
  ok(
    conta.addresses?.find((a) => a.id === casa?.id)?.is_default_shipping === true &&
      conta.addresses?.find((a) => a.id === trabalho?.id)?.is_default_shipping === false,
    "e o principal trocou no Medusa"
  )

  /* ── excluir: pergunta antes ── */
  await visivel(pagina, `[data-excluir-endereco="${casa?.id}"]`).click()
  ok(
    (await textoDe(pagina, `article[data-endereco="${casa?.id}"] .endereco__confirma`)) ===
      "Excluir este endereço?",
    "excluir pergunta antes, na própria caixa"
  )
  await pagina
    .waitForFunction(() => document.activeElement?.hasAttribute("data-excluir-nao"), null, {
      timeout: 5000,
    })
    .catch(() => null)
  ok((await focado(pagina)).texto === "Não", "com o foco no Não")
  await visivel(pagina, `[data-excluir-nao="${casa?.id}"]`).click()
  ok(
    (await visivel(pagina, `[data-excluir-endereco="${casa?.id}"]`).count()) === 1 &&
      (await doCliente(tokenDono)).addresses?.length === 2,
    "o Não desfaz a pergunta, e nada sai"
  )

  // O principal sai — e o outro assume, senão o checkout abriria vazio.
  await visivel(pagina, `[data-excluir-endereco="${casa?.id}"]`).click()
  await visivel(pagina, `[data-excluir-sim="${casa?.id}"]`).click()
  ok(await esperarAviso(pagina, "Endereço excluído."), "excluiu: o aviso")
  conta = await doCliente(tokenDono)
  ok(
    conta.addresses?.length === 1 &&
      conta.addresses[0].id === trabalho?.id &&
      conta.addresses[0].is_default_shipping === true,
    "excluir o principal passa o posto pro que sobrou",
    JSON.stringify(conta.addresses?.map((a) => [a.address_name, a.is_default_shipping]))
  )
  await pagina
    .waitForFunction(() => document.activeElement?.hasAttribute("data-novo-endereco"), null, {
      timeout: 5000,
    })
    .catch(() => null)
  ok((await focado(pagina)).texto.includes("Adicionar endereço"), "e o foco vai pro Adicionar")

  /* ── de outra pessoa ── */
  const tokenOutro = await tokenPorApi(novoEmail())
  const alheio = await medusa(`/store/customers/me/addresses/${trabalho?.id}`, {
    corpo: { address_name: "roubado" },
    token: tokenOutro,
  })
  ok(
    alheio.status === 404 &&
      (await doCliente(tokenDono)).addresses?.[0]?.address_name === "Trabalho",
    "o endereço de uma conta não se edita com o token de outra",
    String(alheio.status)
  )
  await contexto.close()
}

/* ── 15. meus dados ───────────────────────────────────────────────────────── */

titulo("Meus dados")
if (tokenDono) {
  const { contexto, pagina } = await abaNaConta(tokenDono)
  await pagina.goto(`${LOJA}/conta/dados`)
  await hidratado(pagina, "form[data-form-dados] [name=nome]")
  const form = () => visivel(pagina, "form[data-form-dados]")
  const campo = (nome) => form().locator(`[name="${nome}"]`)

  ok((await textoDe(pagina, "[data-email-fixo]")) === DONO, "o e-mail aparece, e não é campo")
  ok((await form().locator('input[type="email"]').count()) === 0, "(não tem como editar ali)")
  ok(
    !(await campo("ofertas-email").isChecked()) && !(await campo("ofertas-whatsapp").isChecked()),
    "as ofertas nascem desmarcadas — consentimento não vem marcado"
  )

  await campo("nome").fill("Rafael")
  await campo("sobrenome").fill("Souza")
  await campo("telefone").pressSequentially("11987654321")
  ok(
    (await campo("telefone").inputValue()) === "(11) 98765-4321",
    "o celular com a máscara do checkout"
  )
  await campo("documento").fill("111.444.777-36")
  await form().locator("button[type=submit]").click()
  await pagina
    .waitForFunction(
      () => /não confere/.test(window.__visivel("form[data-form-dados]")?.textContent ?? ""),
      null,
      { timeout: 15000 }
    )
    .catch(() => null)
  ok(
    ((await form().textContent()) ?? "").includes("Esse CPF não confere"),
    "CPF com o dígito errado: o recado do checkout, no campo"
  )
  ok(
    (await campo("nome").inputValue()) === "Rafael",
    "e o resto do que foi digitado continua lá (o React dá reset no formulário)"
  )
  ok(!(await doCliente(tokenDono)).first_name, "e nada foi gravado")

  await campo("documento").fill("111.444.777-35")
  await campo("ofertas-email").check()
  await form().locator("button[type=submit]").click()
  ok(await esperarAviso(pagina, "Dados salvos."), "salvou: o aviso")
  let c = await doCliente(tokenDono)
  const dataDoSim = c.metadata?.ofertas?.email
  ok(
    c.first_name === "Rafael" &&
      c.last_name === "Souza" &&
      c.phone === "+5511987654321" &&
      c.metadata?.documento?.valor === "11144477735" &&
      c.metadata?.documento?.tipo === "cpf",
    "no Medusa: nome, celular com +55 e o documento sem pontuação",
    JSON.stringify({ n: c.first_name, t: c.phone, d: c.metadata?.documento })
  )
  ok(
    typeof dataDoSim === "string" &&
      !Number.isNaN(Date.parse(dataDoSim)) &&
      c.metadata?.ofertas?.whatsapp === null,
    "a oferta por e-mail guarda a DATA do sim; a do WhatsApp, null",
    JSON.stringify(c.metadata?.ofertas)
  )
  await pagina
    .waitForFunction(
      () => window.__visivel(".menu-conta__oi")?.textContent === "Oi, Rafael",
      null,
      {
        timeout: 10000,
      }
    )
    .catch(() => null)
  ok((await textoDe(pagina, ".menu-conta__oi")) === "Oi, Rafael", "o menu passa a chamar pelo nome")

  // Salvar de novo, com a caixa ainda marcada, não inventa um consentimento novo.
  // (O aviso do primeiro ainda pode estar na tela, com o mesmo texto: quem diz
  // que o segundo chegou é o Medusa.)
  await campo("ofertas-whatsapp").check()
  await form().locator("button[type=submit]").click()
  for (let i = 0; i < 30; i++) {
    c = await doCliente(tokenDono)
    if (c.metadata?.ofertas?.whatsapp) break
    await esperar(300)
  }
  ok(
    c.metadata?.ofertas?.email === dataDoSim && typeof c.metadata?.ofertas?.whatsapp === "string",
    "o sim do e-mail mantém a data de antes; o do WhatsApp ganha a sua",
    JSON.stringify(c.metadata?.ofertas)
  )
  ok(
    c.addresses?.length === 1,
    "e salvar os dados não mexe nos endereços (o metadata mescla, não substitui)"
  )

  await pagina.reload()
  await hidratado(pagina, "form[data-form-dados] [name=nome]")
  ok(
    (await campo("documento").inputValue()) === "111.444.777-35" &&
      (await campo("telefone").inputValue()) === "(11) 98765-4321" &&
      (await campo("ofertas-email").isChecked()),
    "recarregado, o formulário mostra o que está gravado"
  )
  await contexto.close()
}

/* ── 16. a visão geral: os atalhos, e o link do cabeçalho ─────────────────── */

titulo("A visão geral e o link do cabeçalho")
{
  const home = await fetch(`${LOJA}/`)
  const html = await home.text()
  ok(
    /<a[^>]*href="\/conta"[^>]*aria-label="Minha conta"|<a[^>]*aria-label="Minha conta"[^>]*href="\/conta"/.test(
      html
    ),
    'o "Minha conta" do cabeçalho leva pra /conta (e não mais pro /em-breve)'
  )
  ok(!/href="\/em-breve"[^>]*>Minha conta</.test(html), "nem o do rodapé")

  const tokenVazio = await tokenPorApi(novoEmail())
  const vazio = await abaNaConta(tokenVazio)
  await vazio.pagina.goto(`${LOJA}/conta`)
  await visivel(vazio.pagina, "[data-bloco-dados]").waitFor({ timeout: 20000 })
  ok(
    (await textoDe(vazio.pagina, "[data-bloco-endereco] .resumo-curto")).startsWith(
      "Nenhum endereço salvo ainda"
    ) && (await textoDe(vazio.pagina, "[data-bloco-endereco] .link")) === "Adicionar endereço",
    "conta nova: o bloco do endereço diz que o primeiro do checkout fica guardado"
  )
  ok(
    (await textoDe(vazio.pagina, "[data-bloco-dados] .resumo-curto")).startsWith(
      "Falta nome, celular e CPF"
    ) && (await textoDe(vazio.pagina, "[data-bloco-dados] .link")) === "Completar dados",
    "e o dos dados, o que falta"
  )
  await vazio.contexto.close()

  if (tokenDono) {
    const cheia = await abaNaConta(tokenDono)
    await cheia.pagina.goto(`${LOJA}/conta`)
    await visivel(cheia.pagina, "[data-bloco-dados]").waitFor({ timeout: 20000 })
    const endereco = await textoDe(cheia.pagina, "[data-bloco-endereco] .resumo-curto")
    ok(
      endereco.startsWith("Trabalho") && endereco.includes("Rua das Palmeiras, S/N"),
      "com endereço: o principal, pelo nome",
      endereco
    )
    const dados = await textoDe(cheia.pagina, "[data-bloco-dados] .resumo-curto")
    ok(
      dados.includes("Rafael Souza") &&
        dados.includes("(11) 98765-4321") &&
        dados.includes("CPF •••.444.777-••") &&
        !dados.includes("111.444.777-35"),
      "com dados: nome e celular — e o CPF sem o começo e o fim",
      dados
    )
    await cheia.contexto.close()
  }
}

/* ── 17. o checkout com a conta aberta ────────────────────────────────────── */

titulo("O checkout com a conta aberta")
frenet ??= await subirFrenetFalsa()
pagarme ??= await subirPagarmeFalso()

const regiaoBrl = (await medusa("/store/regions", { metodo: "GET" })).corpo.regions?.find(
  (r) => r.currency_code === "brl"
)
const shampoo = (
  await medusa(
    `/store/products?handle=shampoo-para-barba&region_id=${regiaoBrl?.id}&fields=*variants`,
    { metodo: "GET" }
  )
).corpo.products?.[0]?.variants?.[0]?.id

/** Um carrinho com um shampoo, direto na API — a PDP é assunto do conferidor dela. */
async function carrinhoComShampoo() {
  const { corpo } = await medusa("/store/carts", { corpo: { region_id: regiaoBrl?.id } })
  await medusa(`/store/carts/${corpo.cart.id}/line-items`, {
    corpo: { variant_id: shampoo, quantity: 1 },
  })
  return corpo.cart.id
}

/*
  SÓ O QUE ESTÁ NA TELA. No `next start` o miolo do checkout chega em
  streaming, e por um instante a cópia do HTML (ainda escondida) e a que o
  React já desenhou convivem — dois `#form-contato`. Mirar o visível é
  mirar o que a pessoa vê.
*/
const noCheckout = (pagina, sel) => visivel(pagina, `.fluxo ${sel}`)

async function pagarNoPix(pagina) {
  await visivel(pagina, "#form-pagamento").waitFor({ timeout: 30000 })
  await hidratado(pagina, "#form-pagamento button[type=submit]")
  await visivel(pagina, "#form-pagamento .opcao")
    .filter({ hasText: "Pix" })
    .locator("input")
    .check()
  await visivel(pagina, "#form-pagamento button[type=submit]").click()
  await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 40000 })
  return new URL(pagina.url()).pathname.split("/").pop()
}

async function entregaPeloCep(pagina, cep, numero) {
  await visivel(pagina, "#form-entrega").waitFor({ timeout: 30000 })
  await hidratado(pagina, "#form-entrega [name=cep]")
  await noCheckout(pagina, "[name=cep]").fill(cep)
  await pagina.waitForFunction(
    () => window.__visivel('.fluxo [name="rua"]')?.value?.length > 0,
    null,
    { timeout: 20000 }
  )
  await noCheckout(pagina, "[name=numero]").fill(numero)
  await visivel(pagina, "#form-entrega .opcao").first().waitFor({ timeout: 20000 })
  await visivel(pagina, "#form-entrega button[type=submit]").click()
}

async function contatoNaMao(pagina, { email, nome, sobrenome, telefone }) {
  await visivel(pagina, "#form-contato").waitFor({ timeout: 30000 })
  await hidratado(pagina, "#form-contato [name=email]")
  if (email) await noCheckout(pagina, "[name=email]").fill(email)
  await noCheckout(pagina, "[name=nome]").fill(nome)
  await noCheckout(pagina, "[name=sobrenome]").fill(sobrenome)
  await noCheckout(pagina, "[name=telefone]").fill(telefone)
  await noCheckout(pagina, "[name=documento]").fill("111.444.777-35")
  await visivel(pagina, "#form-contato button[type=submit]").click()
}

const pedidosDa = async (token) =>
  (await medusa("/store/orders?fields=id&limit=50", { metodo: "GET", token })).corpo.orders ?? []

if (!regiaoBrl || !shampoo) {
  ok(false, "o checkout precisa da região em real e do shampoo no catálogo local")
} else {
  /* ── com dados e endereço: abre no passo 2, preenchido ── */
  const COMPLETA = novoEmail()
  const tokenCompleta = await tokenPorApi(COMPLETA)
  await medusa("/store/customers/me", {
    corpo: {
      first_name: "Rafael",
      last_name: "Souza",
      phone: "+5511987654321",
      metadata: { documento: { tipo: "cpf", valor: "11144477735" } },
    },
    token: tokenCompleta,
  })
  await medusa("/store/customers/me/addresses", {
    corpo: {
      address_1: "Avenida Paulista, 1578",
      address_2: "Apto 12 — Bela Vista",
      city: "São Paulo",
      province: "SP",
      postal_code: "01310100",
      country_code: "br",
      metadata: {
        rua: "Avenida Paulista",
        numero: "1578",
        complemento: "Apto 12",
        bairro: "Bela Vista",
      },
      address_name: "Casa",
      is_default_shipping: true,
    },
    token: tokenCompleta,
  })
  const idCompleta = (await doCliente(tokenCompleta)).id

  const carrinho = await carrinhoComShampoo()
  const { contexto, pagina } = await abaNaConta(tokenCompleta)
  await contexto.addCookies([{ name: "carrinho", value: carrinho, url: LOJA }])
  await pagina.goto(`${LOJA}/checkout`)
  await visivel(pagina, "#form-entrega").waitFor({ timeout: 30000 })
  ok(
    (await visivel(pagina, ".painel[data-ativo]").getAttribute("aria-labelledby")) === "t-entrega",
    "com dados e endereço na conta, o checkout abre direto na entrega"
  )
  const resumo = await visivel(pagina, ".feito-passo__txt").first().innerText()
  ok(
    resumo.includes("Rafael Souza") && resumo.includes(COMPLETA),
    "o passo 1 vem feito, com o nome e o e-mail da conta",
    resumo
  )
  ok(
    (await noCheckout(pagina, "[name=cep]").inputValue()) === "01310-100" &&
      (await noCheckout(pagina, "[name=numero]").inputValue()) === "1578" &&
      (await noCheckout(pagina, "[name=complemento]").inputValue()) === "Apto 12",
    "e o endereço principal, preenchido — com número e complemento"
  )
  await visivel(pagina, "#form-entrega .opcao").first().waitFor({ timeout: 20000 })
  ok(
    (await visivel(pagina, "#form-entrega .opcao").count()) > 0,
    "com as entregas já cotadas pro CEP dele"
  )
  const noMedusa = (
    await medusa(`/store/carts/${carrinho}?fields=id,email,customer.id,*billing_address`, {
      metodo: "GET",
    })
  ).corpo.cart
  ok(
    noMedusa?.customer?.id === idCompleta && noMedusa?.email === COMPLETA,
    "o carrinho passou pro nome da conta, com o e-mail dela",
    JSON.stringify({ dono: noMedusa?.customer?.id, email: noMedusa?.email })
  )
  ok(
    noMedusa?.billing_address?.metadata?.documento?.valor === "11144477735",
    "e o CPF da conta foi pro endereço de cobrança, onde o checkout guarda"
  )

  await hidratado(pagina, "#form-entrega button[type=submit]")
  await visivel(pagina, "#form-entrega button[type=submit]").click()
  const pedidoDaCompleta = await pagarNoPix(pagina)
  ok(
    (await pedidosDa(tokenCompleta)).some((o) => o.id === pedidoDaCompleta),
    "o pedido nasce na conta"
  )
  await esperar(2500)
  ok(
    (await doCliente(tokenCompleta)).addresses?.length === 1,
    "comprar pro endereço que já está salvo não duplica ele"
  )
  deixados.push({ id: pedidoDaCompleta })
  await contexto.close()

  /* ── conta vazia: o que a compra deixa ── */
  const VAZIA = novoEmail()
  const tokenVazia = await tokenPorApi(VAZIA)
  const carrinhoVazia = await carrinhoComShampoo()
  const b = await abaNaConta(tokenVazia)
  await b.contexto.addCookies([{ name: "carrinho", value: carrinhoVazia, url: LOJA }])
  await b.pagina.goto(`${LOJA}/checkout`)
  await visivel(b.pagina, "#form-contato").waitFor({ timeout: 30000 })
  await hidratado(b.pagina, "#form-contato [name=email]")
  ok(
    (await noCheckout(b.pagina, "[name=email]").inputValue()) === VAZIA,
    "conta sem dados: o checkout abre no passo 1, com o e-mail da conta"
  )
  await contatoNaMao(b.pagina, {
    nome: "Bruna",
    sobrenome: "Lima",
    telefone: "(47) 99999-8888",
  })
  await entregaPeloCep(b.pagina, "01310-100", "900")
  const pedidoDaVazia = await pagarNoPix(b.pagina)
  ok(
    (await pedidosDa(tokenVazia)).some((o) => o.id === pedidoDaVazia),
    "o pedido nasce na conta"
  )
  deixados.push({ id: pedidoDaVazia })
  let depois = {}
  for (let i = 0; i < 20 && !depois.addresses?.length; i++) {
    await esperar(500)
    depois = await doCliente(tokenVazia)
  }
  const guardado = depois.addresses?.[0]
  ok(
    depois.addresses?.length === 1 &&
      guardado?.is_default_shipping === true &&
      guardado?.metadata?.numero === "900" &&
      guardado?.postal_code === "01310100",
    "o endereço da compra fica salvo na conta — e vira o principal",
    JSON.stringify(depois.addresses)
  )
  ok(
    depois.first_name === "Bruna" &&
      depois.last_name === "Lima" &&
      depois.phone === "+5547999998888" &&
      depois.metadata?.documento?.valor === "11144477735",
    "e nome, celular e CPF completam os dados que estavam vazios",
    JSON.stringify({ n: depois.first_name, t: depois.phone, d: depois.metadata?.documento })
  )
  await b.contexto.close()

  /* ── sem a conta aberta, com o e-mail dela: nada escrito nela ── */
  const antes = (await doCliente(tokenCompleta)).addresses?.length
  const carrinhoAnonimo = await carrinhoComShampoo()
  const d = await abaNaConta(null)
  await d.contexto.addCookies([{ name: "carrinho", value: carrinhoAnonimo, url: LOJA }])
  await d.pagina.goto(`${LOJA}/checkout`)
  await contatoNaMao(d.pagina, {
    email: COMPLETA,
    nome: "Outra",
    sobrenome: "Pessoa",
    telefone: "(21) 98888-7777",
  })
  await entregaPeloCep(d.pagina, "01310-100", "7")
  const pedidoAnonimo = await pagarNoPix(d.pagina)
  deixados.push({ id: pedidoAnonimo })
  await esperar(2500)
  const intacta = await doCliente(tokenCompleta)
  ok(
    intacta.addresses?.length === antes && intacta.first_name === "Rafael",
    "comprar SEM entrar, com o e-mail de uma conta, não escreve endereço nem dados nela",
    `${antes} → ${intacta.addresses?.length}, ${intacta.first_name}`
  )
  await d.contexto.close()

  /* ── sair leva a sacola da conta ── */
  titulo("Sair leva a sacola da conta")
  const carrinhoDaConta = await carrinhoComShampoo()
  const s = await abaNaConta(tokenCompleta)
  await s.contexto.addCookies([{ name: "carrinho", value: carrinhoDaConta, url: LOJA }])
  await s.pagina.goto(`${LOJA}/checkout`)
  await visivel(s.pagina, "#form-entrega").waitFor({ timeout: 30000 })
  await s.pagina.goto(`${LOJA}/conta`)
  await hidratado(s.pagina, ".menu-conta__sair")
  await visivel(s.pagina, ".menu-conta__sair").click()
  await s.pagina.waitForURL("**/conta/entrar?saiu=1", { timeout: 20000 })
  ok(
    !(await s.contexto.cookies()).some((c) => c.name === "carrinho" && c.value),
    "com a sacola já no nome da conta, sair leva ela junto"
  )
  await s.contexto.close()

  const carrinhoSolto = await carrinhoComShampoo()
  const t = await abaNaConta(tokenCompleta)
  await t.contexto.addCookies([{ name: "carrinho", value: carrinhoSolto, url: LOJA }])
  await t.pagina.goto(`${LOJA}/conta`)
  await hidratado(t.pagina, ".menu-conta__sair")
  await visivel(t.pagina, ".menu-conta__sair").click()
  await t.pagina.waitForURL("**/conta/entrar?saiu=1", { timeout: 20000 })
  ok(
    (await t.contexto.cookies()).some((c) => c.name === "carrinho" && c.value === carrinhoSolto),
    "a sacola que não é da conta fica"
  )
  await t.contexto.close()
}

/* ── 18. higiene ──────────────────────────────────────────────────────────── */

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
