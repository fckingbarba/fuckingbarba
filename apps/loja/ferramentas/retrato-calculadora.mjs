/**
 * RETRATO DA CALCULADORA DE CEP — pra olhar, não pra passar ou falhar.
 *
 *   node ferramentas/retrato-calculadora.mjs
 *
 * Contra um `next build` + `next start`, e NÃO contra o `next dev`: neste
 * sandbox o websocket de recarga do modo dev é barrado e a página não
 * hidrata — a calculadora fica de pé no HTML, mas morta. Conferir layout de
 * componente interativo no dev daria a impressão de que ele não funciona.
 *
 * E o build tem que ser feito com o `.env.development.local` exportado: o
 * `next start` lê o `.env.local`, que aponta pro Medusa de PRODUÇÃO — e aí a
 * foto seria de outra loja, e o botão "Adicionar" criaria carrinho lá.
 *
 * Variáveis: LOJA_URL (padrão :3100), CHROMIUM, SAIDA, PRODUTO, e
 *            MEDUSA_BACKEND_URL + ADMIN_EMAIL + ADMIN_SENHA pro retrato com
 *            preço de emergência (sem elas ele é pulado).
 *
 * Sobe a Frenet falsa, digita um CEP na PDP e na sacola, clica em calcular e
 * fotografa o resultado nos dois lugares, em 1440px e em 390px. É o único
 * jeito de conferir layout: conferidor mede altura e posição, e isso pega
 * desalinhamento — não pega "ficou feio". O comportamento da sacola (a
 * escolha virar o frete do carrinho) quem confere é o `conferir-frete.mjs`.
 */

import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PORTA_PADRAO, subirFrenetFalsa } from "./frenet-falsa.mjs"

const LOJA = process.env.LOJA_URL ?? "http://127.0.0.1:3100"
const CROMO = process.env.CHROMIUM || undefined
const SAIDA = process.env.SAIDA ?? join(tmpdir(), "retratos-calculadora")
const PRODUTO = process.env.PRODUTO ?? "fator-de-crescimento-para-barba"
const CEP = "90010-150"

await mkdir(SAIDA, { recursive: true })
const falsa = await subirFrenetFalsa({ porta: PORTA_PADRAO })
console.log(`  ⚙  Frenet falsa em http://127.0.0.1:${PORTA_PADRAO}/shipping/quote`)

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})

/** Digita o CEP, clica e espera a resposta aparecer de verdade. */
async function cotar(pagina, dentro = "") {
  const campo = pagina.locator(`${dentro} .cep__campo`).first()
  await campo.waitFor({ state: "visible", timeout: 15000 })
  await campo.fill("")
  await campo.type(CEP, { delay: 30 })
  await pagina.locator(`${dentro} .cep__botao`).first().click()
  await pagina.locator(`${dentro} .cep__opcao`).first().waitFor({ timeout: 20000 })
  await pagina.waitForTimeout(400)
}

async function retrato(nome, largura, altura, trabalho) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
  })
  const pagina = await contexto.newPage()
  const erros = []
  pagina.on("pageerror", (e) => erros.push(String(e)))
  try {
    await trabalho(pagina, nome)
    if (erros.length) console.log(`  ⚠  ${nome}: erro de JS — ${erros[0]}`)
  } catch (e) {
    console.log(`  ✗  ${nome}: ${e.message.split("\n")[0]}`)
  }
  await contexto.close()
}

/* ── a calculadora na PDP, sozinha e no contexto ────────────────────────── */

for (const [nome, largura, altura] of [
  ["pdp-desktop", 1440, 1100],
  ["pdp-celular", 390, 900],
]) {
  await retrato(nome, largura, altura, async (pagina) => {
    await pagina.goto(`${LOJA}/produtos/${PRODUTO}`, { waitUntil: "networkidle" })
    await cotar(pagina)

    const caixa = pagina.locator(".cep").first()
    await caixa.screenshot({ path: `${SAIDA}/calculadora-${nome}.png` })
    console.log(`  📸 calculadora-${nome}.png`)

    /* a coluna de compra inteira: é assim que ela chega pro cliente, com o
       preço em cima e o botão embaixo — é onde se vê se ela pesa demais */
    const coluna = pagina.locator(".compra").first()
    if (await coluna.count()) {
      await coluna.screenshot({ path: `${SAIDA}/compra-${nome}.png` })
      console.log(`  📸 compra-${nome}.png`)
    }
  })
}

/* ── e na sacola, que tem o bloco dela ──────────────────────────────────────

   A sacola NÃO usa a calculadora da PDP: o bloco "Frete e prazo" dela é o
   do protótipo (`components/sacola/entrega.tsx`), com as entregas como
   opções de escolher. Fotografa o campo antes, a lista depois, a troca pra
   expressa (o pé da gaveta muda junto) e a segunda unidade, que passa do
   piso e faz a econômica aparecer como "Grátis" com o preço cheio riscado.
   Compare com a gaveta do `ferramentas/porte/prototipo.html`. */

async function sacolaCheia(pagina) {
  await pagina.goto(`${LOJA}/produtos/${PRODUTO}`, { waitUntil: "networkidle" })
  await pagina.locator(".compra__comprar").first().click({ timeout: 20000 })
  await pagina.locator(".sacolinha__item").first().waitFor({ timeout: 20000 })
  await pagina.waitForTimeout(700)
}

async function cotarNaSacola(pagina) {
  const campo = pagina.locator("#carrinho-cep")
  await campo.waitFor({ state: "visible", timeout: 15000 })
  await campo.fill("")
  await campo.type(CEP, { delay: 30 })
  await pagina.locator(".sacolinha__cep-botao").click()
  await pagina
    .locator(".sacolinha__opcao, .sacolinha__cep-erro:not([hidden])")
    .first()
    .waitFor({ timeout: 25000 })
  await pagina.waitForTimeout(500)
}

const fotoDaSacola = async (pagina, nome) => {
  await pagina
    .locator(".sacolinha")
    .first()
    .screenshot({ path: `${SAIDA}/${nome}.png` })
  console.log(`  📸 ${nome}.png`)
}

for (const [nome, largura, altura] of [
  ["sacola", 1440, 1000],
  ["sacola-celular", 390, 844],
]) {
  await retrato(nome, largura, altura, async (pagina) => {
    await sacolaCheia(pagina)
    await fotoDaSacola(pagina, `${nome}-antes`)
    await cotarNaSacola(pagina)
    await fotoDaSacola(pagina, `${nome}-calculada`)

    if (nome !== "sacola") return
    await pagina.locator(".sacolinha__opcao").nth(1).click()
    await pagina.locator(".sacolinha[data-ocupada]").waitFor({ state: "detached", timeout: 15000 })
    await pagina.waitForTimeout(300)
    await fotoDaSacola(pagina, `${nome}-expressa`)

    await pagina.locator(".sacolinha__passo[aria-label^='Aumentar']").first().click()
    await pagina
      .locator(".sacolinha__opcao-preco[data-gratis]")
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => console.log("  ⚠  a segunda unidade não passou do piso — sem foto do Grátis"))
    await pagina.waitForTimeout(300)
    await fotoDaSacola(pagina, `${nome}-gratis`)
  })
}

/* ── e o caminho da queda, que é o que ninguém desenha ──────────────────────

   Com a transportadora fora do ar, o que aparece depende do admin: com
   preço de emergência, a calculadora mostra esse preço e o prazo escrito lá;
   sem ele, mostra que não conseguiu. Os dois são fotografados, porque os
   dois vão acontecer — o segundo é o estado da produção HOJE, enquanto o
   campo "Quando a cotação falhar" estiver vazio. */

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const EMAIL = process.env.ADMIN_EMAIL
const SENHA = process.env.ADMIN_SENHA

/** Espera a resposta, seja ela opção ou recusa — as duas são resposta. */
async function cotarQualquer(pagina) {
  const campo = pagina.locator(".cep__campo").first()
  await campo.waitFor({ state: "visible", timeout: 15000 })
  await campo.fill("")
  await campo.type(CEP, { delay: 30 })
  await pagina.locator(".cep__botao").first().click()
  await pagina.locator(".cep__opcao, .cep__erro").first().waitFor({ timeout: 25000 })
  await pagina.waitForTimeout(400)
}

falsa.roteiro = "queda"

await retrato("queda-sem-emergencia", 1440, 1100, async (pagina) => {
  await pagina.goto(`${LOJA}/produtos/${PRODUTO}`, { waitUntil: "networkidle" })
  await cotarQualquer(pagina)
  await pagina
    .locator(".cep")
    .first()
    .screenshot({ path: `${SAIDA}/calculadora-queda-sem-emergencia.png` })
  console.log("  📸 calculadora-queda-sem-emergencia.png")
})

await retrato("sacola-queda-sem-emergencia", 1440, 1000, async (pagina) => {
  await sacolaCheia(pagina)
  await cotarNaSacola(pagina)
  await fotoDaSacola(pagina, "sacola-queda-sem-emergencia")
})

if (EMAIL && SENHA) {
  const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const { token } = await entrar.json()
  const cab = { "content-type": "application/json", authorization: `Bearer ${token}` }
  const antes = (await (await fetch(`${MEDUSA}/admin/configuracoes`, { headers: cab })).json())
    .configuracoes

  try {
    await fetch(`${MEDUSA}/admin/configuracoes`, {
      method: "POST",
      headers: cab,
      body: JSON.stringify({
        ...antes,
        cotacao: { precoDeEmergencia: 20, prazoDeEmergencia: "7 dias úteis" },
      }),
    })
    await retrato("queda-com-emergencia", 1440, 1100, async (pagina) => {
      await pagina.goto(`${LOJA}/produtos/${PRODUTO}`, { waitUntil: "networkidle" })
      await cotarQualquer(pagina)
      await pagina
        .locator(".cep")
        .first()
        .screenshot({ path: `${SAIDA}/calculadora-queda-com-emergencia.png` })
      console.log("  📸 calculadora-queda-com-emergencia.png")
    })
    await retrato("sacola-queda-com-emergencia", 1440, 1000, async (pagina) => {
      await sacolaCheia(pagina)
      await cotarNaSacola(pagina)
      await fotoDaSacola(pagina, "sacola-queda-com-emergencia")
    })
  } finally {
    await fetch(`${MEDUSA}/admin/configuracoes`, {
      method: "POST",
      headers: cab,
      body: JSON.stringify(antes),
    })
    console.log("  ↩  configurações restauradas")
  }
} else {
  console.log("  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — pulei o retrato com preço de emergência")
}

falsa.roteiro = "normal"

await navegador.close()
falsa.fechar()
console.log(`\n  pronto — fotos em ${SAIDA}`)
