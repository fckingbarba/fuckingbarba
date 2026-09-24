/**
 * AS PEÇAS DOS CONFERIDORES DO PAINEL — o que o `conferir-entrar.mjs` e o
 * `conferir-pedidos.mjs` fazem igual: a contagem dos ✓ e ✗, o Resend de
 * mentira (de onde sai o código de entrar), a API assinada, o navegador e o
 * caminho de entrar pela tela.
 *
 * Variáveis: PAINEL (padrão http://localhost:3100), MEDUSA_BACKEND_URL
 * (padrão http://127.0.0.1:9000), REVALIDAR_SEGREDO e DASHBOARD_DONO_EMAIL
 * (os mesmos do backend), PORTA_RESEND (4330) e CHROMIUM.
 */

import { chromium } from "playwright"
import { subirResendFalso } from "../../loja/ferramentas/resend-falso.mjs"

export const PAINEL = process.env.PAINEL ?? "http://localhost:3100"
export const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
export const SEGREDO = process.env.REVALIDAR_SEGREDO ?? ""
export const DONO = (process.env.DASHBOARD_DONO_EMAIL ?? "").trim().toLowerCase()

export const RODADA = Date.now().toString(36)
/** Um IP inventado por rodada: o limite por IP de uma rodada não pesa na seguinte. */
export const IP = `10.${(Date.now() >> 16) % 250}.${(Date.now() >> 8) % 250}.${Date.now() % 250}`

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── a contagem ───────────────────────────────────────────────────────────── */

const placar = { falhas: 0, testes: 0 }

export const ok = (cond, texto, det = "") => {
  placar.testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    placar.falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
export const falhou = (texto) => {
  placar.falhas++
  console.log(`\n  ✗ parou no meio: ${texto}`)
}
export const titulo = (t) => console.log(`\n${t}`)

/** A última linha, e o código de saída: 1 se algo falhou. */
export function resumo() {
  console.log(
    `\n${placar.testes - placar.falhas}/${placar.testes} conferidos${
      placar.falhas ? ` — ${placar.falhas} falharam` : ""
    }`
  )
  return placar.falhas ? 1 : 0
}

export function exigirAmbiente() {
  if (!SEGREDO || !DONO) {
    console.log("  ⚠  faltam REVALIDAR_SEGREDO e DASHBOARD_DONO_EMAIL (os mesmos do backend)")
    process.exit(1)
  }
}

/* ── o Resend falso e a API ──────────────────────────────────────────────── */

export async function subirResend() {
  return subirResendFalso().catch((e) => {
    console.log(`  ⚠  não consegui subir o Resend falso (${e.message}) — porta ocupada?`)
    process.exit(1)
  })
}

export async function medusa(
  caminho,
  { metodo = "POST", corpo, token, assinado = true, extras = {} } = {}
) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(assinado ? { "x-loja-segredo": SEGREDO, "x-cliente-ip": IP } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extras,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

export const doPainel = (e) => /^\d{6} é o seu código do painel/.test(e.subject ?? "")
export const doConvite = (e) => e.subject === "Seu convite pro painel da FuckingBarba"
export const codigoDe = (email) => email?.subject?.match(/^(\d{6})/)?.[1]

export function caixaDoResend(resend) {
  const quantos = (email, filtro) =>
    resend.emails.filter((e) => e.to?.includes(email) && filtro(e)).length
  async function esperarEmail(email, filtro, antes, ms = 8000) {
    const fim = Date.now() + ms
    while (Date.now() < fim) {
      const deste = resend.emails.filter((e) => e.to?.includes(email) && filtro(e))
      if (deste.length > antes) return deste.at(-1)
      await esperar(150)
    }
    return undefined
  }
  return { quantos, esperarEmail }
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

export async function abrirNavegador() {
  const navegador = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
  )
  const errosDeConsole = []
  async function novaAba(viewport = { width: 1280, height: 900 }) {
    const contexto = await navegador.newContext({ viewport, extraHTTPHeaders: { "x-real-ip": IP } })
    const pagina = await contexto.newPage()
    pagina.on("pageerror", (e) => errosDeConsole.push(`${pagina.url()}: ${e.message}`))
    pagina.on("console", (m) => {
      if (m.type() === "error") errosDeConsole.push(`${pagina.url()}: ${m.text()}`)
    })
    return { contexto, pagina }
  }
  return { navegador, novaAba, errosDeConsole }
}

/** Espera o React assumir o elemento — digitado antes, o valor some na hidratação. */
export async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) => {
      const el = document.querySelector(s)
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps$")))
    },
    seletor,
    { timeout: 15000 }
  )
}

export const caminho = (pagina) => new URL(pagina.url()).pathname
export const textoDe = async (pagina, seletor) =>
  (
    (await pagina
      .locator(seletor)
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  ).trim()

export const menu = async (pagina) =>
  (await pagina.locator(".lateral .nav a").allTextContents()).map((t) => t.trim())

export async function semRolagemDeLado(pagina) {
  return pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

/* ── entrar pela tela ─────────────────────────────────────────────────────── */

/** Pede o código pela tela e espera chegar na tela do código. */
export async function pedirCodigo(pagina, email) {
  await pagina.goto(`${PAINEL}/entrar`)
  await hidratado(pagina, "input[name=email]")
  await pagina.fill("input[name=email]", email)
  await pagina.click("button[type=submit]")
  await pagina.waitForURL(/\/entrar\/codigo$/, { timeout: 15000 })
  await hidratado(pagina, "input[name=codigo]")
}

export async function digitarCodigo(pagina, codigo) {
  await pagina.fill("input[name=codigo]", "")
  await pagina.locator("input[name=codigo]").pressSequentially(codigo, { delay: 20 })
}

/** Entra pela tela, do e-mail ao Início. Devolve o cookie da sessão (pra testar a API com o token). */
export async function entrar({ pagina, contexto }, email, caixa) {
  const antes = caixa.quantos(email, doPainel)
  await pedirCodigo(pagina, email)
  const codigo = codigoDe(await caixa.esperarEmail(email, doPainel, antes))
  if (!codigo) return null
  await digitarCodigo(pagina, codigo)
  await pagina.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {})
  return (await contexto.cookies()).find((c) => c.name === "painel_sessao") ?? null
}
