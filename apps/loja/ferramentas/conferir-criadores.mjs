/**
 * CONFERIDOR DA PÁGINA DOS CRIADORES (/criadores) — a página escondida da
 * proposta pra quem grava vídeo pra loja, e a inscrição dela.
 *
 *   node ferramentas/conferir-criadores.mjs [url-da-loja]
 *
 * Variáveis: LOJA (ou o argumento), MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA, CHROMIUM.
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ A página abre só pra quem tem o link (fora do Google e do sitemap), a  │
 * │ oferta e a calculadora batem com a `OFERTA` do código, o kit é o do    │
 * │ Medusa, e a inscrição chega no banco limpa — recusando o que o Medusa  │
 * │ recusaria, campo por campo, com a frase no campo certo.                │
 * │                                                                         │
 * │ Os números da proposta vêm do código (`lib/criadores-visivel.ts`): o   │
 * │ conferidor lê de lá, e a conta da tela tem que dar o mesmo. O kit vem  │
 * │ da API da loja; a inscrição, de `GET /admin/criadores`.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O LIMITE DO FORMULÁRIO é 10 por hora por pessoa: a rodada usa um IP
 * inventado (`x-real-ip`, que a loja assina). No fim, as inscrições da rodada
 * saem do banco (recusa e apaga, pelo admin).
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { comAFaixaRespondida, SEM_POPUP } from "./faixa-respondida.mjs"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA

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
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

const RODADA = Date.now().toString(36)
const EMAIL = `criador.${RODADA}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >>> 16) % 250}.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`

/* ── a oferta, lida do código da loja ─────────────────────────────────────── */

const FONTE = readFileSync(new URL("../src/lib/criadores-visivel.ts", import.meta.url), "utf8")
const numero = (nome) => Number(FONTE.match(new RegExp(`\\b${nome}: (\\d+)`))?.[1])
const OFERTA = {
  fixo: numero("fixo"),
  criativos: numero("criativos"),
  ideias: numero("ideias"),
  ganchosPorIdeia: numero("ganchosPorIdeia"),
  porcento: numero("porcento"),
  pedidoMedio: numero("pedidoMedio"),
}
if (Object.values(OFERTA).some((v) => !Number.isFinite(v) || v <= 0)) {
  console.log(`  ⚠  não li a OFERTA de lib/criadores-visivel.ts: ${JSON.stringify(OFERTA)}`)
  process.exit(1)
}
/** Em centavos, sem erro de arredondamento: 3% de R$ 125 = 375. */
const porVenda = (OFERTA.pedidoMedio * 100 * OFERTA.porcento) / 100
/** O mês em que a comissão somada passa do fixo — a comissão não tem prazo. */
const mesQuePassa = (vendas) =>
  vendas ? Math.floor((OFERTA.fixo * 100) / (vendas * porVenda)) + 1 : null
/** Como a tela escreve (o espaço fixo do Intl vira espaço comum, como no `semEspaco`). */
const reais = (centavos) =>
  semEspaco(
    (centavos / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: centavos % 100 ? 2 : 0,
      maximumFractionDigits: centavos % 100 ? 2 : 0,
    })
  )

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

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
const doBanco = async () =>
  (await admin(`/admin/criadores?email=${encodeURIComponent(EMAIL)}`)).corpo.inscricoes ?? []

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
comAFaixaRespondida(navegador, LOJA)
const noConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const abas = []
async function novaAba(viewport) {
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
  pagina.on("pageerror", (e) => noConsole.push(String(e)))
  abas.push(contexto)
  return { pagina, contexto }
}

/** Espera o React assumir o elemento (o clique antes da hidratação se perde). */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) => {
      const el = document.querySelector(s)
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")))
    },
    seletor,
    { timeout: 30000 }
  )
}

/** Manda o formulário e espera a volta da ação (o POST da página): a frase de um campo, a de cima do botão, ou o "valeu". */
async function mandar(pagina) {
  const resposta = pagina.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/criadores",
    { timeout: 30000 }
  )
  await pagina.click("[data-inscricao] button[type=submit]")
  await resposta
  await pagina.waitForFunction(
    () => !document.querySelector("[data-inscricao] button[aria-busy=true]"),
    null,
    { timeout: 30000 }
  )
  await pagina.waitForTimeout(200)
  return pagina.evaluate(() => ({
    enviada: Boolean(document.querySelector("[data-inscricao-enviada]")),
    erros: [...document.querySelectorAll("[data-inscricao] .campo__erro")]
      .map((e) => ({ id: e.id, texto: e.textContent }))
      .filter((e) => e.texto),
    recado: document.querySelector(".criadores__recado")?.textContent ?? null,
  }))
}

/** A régua da calculadora: o valor e o evento que o React ouve (o `fill` não mexe em range). */
const mover = (regua, valor) =>
  regua.evaluate((el, v) => {
    const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
    definir.call(el, String(v))
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }, valor)

try {
  titulo("A página, e o que a esconde")
  const { pagina, contexto } = await novaAba({ width: 1280, height: 900 })
  const r = await pagina.goto(`${LOJA}/criadores`, { waitUntil: "domcontentloaded" })
  ok(r?.status() === 200, "abre com o link", `HTTP ${r?.status()}`)
  const robots = await pagina.locator('meta[name="robots"]').getAttribute("content")
  ok(
    /noindex/.test(robots ?? "") && /nofollow/.test(robots ?? ""),
    "fora do Google (noindex)",
    robots
  )
  const og = await pagina.locator('meta[property="og:title"]').getAttribute("content")
  ok(semEspaco(og).includes(reais(OFERTA.fixo * 100)), "a prévia do link traz a oferta", og)
  const sitemap = await (await fetch(`${LOJA}/sitemap.xml`)).text()
  ok(!sitemap.includes("/criadores"), "fora do sitemap")
  // O celular do topo: uma foto por momento (gancho, corpo, fecho), carregadas, e o gancho primeiro.
  await pagina
    .waitForFunction(
      () =>
        [...document.querySelectorAll(".criadores__tela img")].every(
          (i) => i.complete && i.naturalWidth > 0
        ),
      null,
      { timeout: 20000 }
    )
    .catch(() => {})
  const fotos = await pagina.evaluate(() => ({
    fases: [...document.querySelectorAll(".criadores__tela img")].map((i) => i.dataset.fase),
    carregadas: [...document.querySelectorAll(".criadores__tela img")].every(
      (i) => i.complete && i.naturalWidth > 0
    ),
  }))
  ok(
    JSON.stringify(fotos.fases) === JSON.stringify(["gancho", "corpo", "fim"]) && fotos.carregadas,
    "o celular tem as três fotos (gancho, corpo e fecho), carregadas",
    JSON.stringify(fotos)
  )

  titulo("A oferta e a calculadora batem com a OFERTA do código")
  const h1 = semEspaco(await pagina.locator("h1").first().textContent())
  ok(h1.includes(reais(OFERTA.fixo * 100)), "o título tem o fixo", h1)
  const valores = await pagina.locator(".criadores__oferta-valor").allTextContents()
  ok(
    semEspaco(valores[0]) === reais(OFERTA.fixo * 100) &&
      semEspaco(valores[1]) === `${OFERTA.porcento}%`,
    "os dois cartões: o fixo e a porcentagem",
    JSON.stringify(valores)
  )
  const regua = pagina.locator("[data-calculadora] input[type=range]")
  await hidratado(pagina, "[data-calculadora] input[type=range]")
  const fixo = semEspaco(
    await pagina.locator('.criadores__oferta[data-modelo="fixo"]').textContent()
  )
  const cada = reais((OFERTA.fixo * 100) / OFERTA.criativos)
  const metade = Math.ceil(OFERTA.criativos / 2)
  ok(
    fixo.includes(`por ${OFERTA.criativos} criativos.`) &&
      fixo.includes(`${cada} cada.`) &&
      fixo.includes(`quando os ${metade} primeiros forem aprovados`) &&
      fixo.includes(`quando os ${OFERTA.criativos} estiverem aprovados`),
    `o fixo: ${OFERTA.criativos} criativos, ${cada} cada, a 1ª metade com ${metade} aprovados`,
    fixo
  )
  ok(
    OFERTA.ideias * OFERTA.ganchosPorIdeia === OFERTA.criativos &&
      (await pagina.locator("[data-matriz] .criadores__quadro").count()) === OFERTA.criativos &&
      (await pagina.locator("[data-matriz] .criadores__matriz-ideia").count()) === OFERTA.ideias,
    `a matriz tem os ${OFERTA.criativos} criativos: ${OFERTA.ideias} ideias × ${OFERTA.ganchosPorIdeia} ganchos`
  )
  ok(
    semEspaco(
      await pagina
        .locator('.criadores__oferta[data-modelo="comissao"] .criadores__oferta-sub')
        .textContent()
    ) === "Sem prazo" &&
      !semEspaco(await pagina.locator("main").textContent()).includes("12 meses"),
    "a comissão é sem prazo (nada de 12 meses na página)"
  )
  for (const vendas of [0, 8, 30, 120]) {
    await mover(regua, vendas)
    const mes = semEspaco(await pagina.locator("[data-por-mes]").textContent())
    const veredito = semEspaco(await pagina.locator("[data-veredito]").textContent())
    const meses = await pagina.locator("[data-veredito]").getAttribute("data-meses")
    const blocos = await pagina.locator(".criadores__bloco").count()
    const esperado = mesQuePassa(vendas)
    const frase =
      esperado === null
        ? "não paga nada"
        : esperado === 1
          ? "já no 1º mês"
          : esperado > 36
            ? "mais de 3 anos"
            : `no ${esperado}º mês`
    ok(
      mes === reais(vendas * porVenda) &&
        meses === String(esperado ?? "") &&
        veredito.includes(frase) &&
        blocos === Math.min(esperado ?? 0, 36),
      `com ${vendas} vendas por mês: ${reais(vendas * porVenda)} por mês, ${
        esperado ? `passa do fixo no mês ${esperado}` : "nada"
      } (${Math.min(esperado ?? 0, 36)} blocos na régua do fixo)`,
      `${mes} · meses=${meses} · ${blocos} blocos · ${veredito}`
    )
  }

  titulo("O kit é o do Medusa")
  const handles = [
    "fator-de-crescimento-para-barba",
    "oleo-para-barba",
    "balm-para-barba",
    "shampoo-para-barba",
  ]
  const doMedusa = []
  for (const h of handles) {
    const rp = await fetch(`${MEDUSA}/store/products?handle=${h}&fields=title`, {
      headers: { "x-publishable-api-key": CHAVE },
    })
    const t = (await rp.json()).products?.[0]?.title
    if (t) doMedusa.push(t)
  }
  const naTela = (await pagina.locator(".criadores__produto p").allTextContents()).map(semEspaco)
  ok(
    doMedusa.length > 0 && JSON.stringify(naTela) === JSON.stringify(doMedusa),
    "os nomes do kit são os do catálogo, na ordem",
    `${JSON.stringify(naTela)} × ${JSON.stringify(doMedusa)}`
  )
  ok(
    (await pagina.locator(".criadores__produto img").count()) === naTela.length,
    "cada produto com a foto"
  )

  titulo("O 'Quero o fixo' marca o modelo lá embaixo")
  await hidratado(pagina, '[data-quero="fixo"]')
  await hidratado(pagina, "[data-inscricao] input[name=modelo]")
  await pagina.click('[data-quero="fixo"]')
  await pagina.waitForFunction(() => location.hash === "#inscricao")
  ok(
    await pagina.locator('[data-inscricao] input[name=modelo][value="fixo"]').isChecked(),
    "desce até a inscrição com o fixo marcado"
  )

  titulo("A inscrição recusa o que o Medusa recusaria, no campo certo")
  await hidratado(pagina, "[data-inscricao] button[type=submit]")
  let volta = await mandar(pagina)
  ok(
    !volta.enviada && volta.erros.length === 1 && volta.erros[0].id.endsWith("-nome-erro"),
    "vazio: a frase no nome",
    JSON.stringify(volta.erros)
  )
  ok(
    await pagina.locator('[data-inscricao] input[name=modelo][value="fixo"]').isChecked(),
    "e o modelo marcado continua marcado"
  )
  const campo = (nome) => pagina.locator(`[data-inscricao] [name="${nome}"]`)
  await campo("nome").fill(`Criador Teste ${RODADA}`)
  await campo("whatsapp").fill("99999-0000")
  volta = await mandar(pagina)
  ok(
    volta.erros[0]?.id.endsWith("-whatsapp-erro") &&
      (await campo("nome").inputValue()) === `Criador Teste ${RODADA}`,
    "WhatsApp sem DDD: a frase no WhatsApp, e o nome continua lá",
    JSON.stringify(volta.erros)
  )
  await campo("whatsapp").fill("(47) 98888-7777")
  await campo("email").fill(EMAIL.toUpperCase())
  await campo("cidade").fill("Joinville, SC")
  volta = await mandar(pagina)
  ok(volta.erros[0]?.id.endsWith("-redes-erro"), "sem Instagram nem TikTok: a frase das redes")
  await campo("instagram").fill("perfil com espaço")
  volta = await mandar(pagina)
  ok(volta.erros[0]?.id.endsWith("-redes-erro"), "perfil com espaço também não vale")
  await campo("instagram").fill(`https://www.instagram.com/Criador.${RODADA}/?igsh=x`)
  volta = await mandar(pagina)
  ok(volta.erros[0]?.id.endsWith("-barba-erro"), "sem a barba: a frase da barba")
  await pagina.locator('[data-inscricao] input[name=barba][value="media"]').check({ force: true })
  await campo("video").fill("javascript:alert(1)")
  volta = await mandar(pagina)
  ok(volta.erros[0]?.id.endsWith("-video-erro"), "link que não é de vídeo: a frase do vídeo")
  await campo("video").fill("instagram.com/reel/teste123")
  volta = await mandar(pagina)
  ok(volta.erros[0]?.id.endsWith("-aceite-erro"), "sem a autorização: não manda")
  ok((await doBanco()).length === 0, "nada disso chegou no banco")
  await pagina.locator('[data-inscricao] input[name="parceria"]').check()
  await pagina.locator('[data-inscricao] input[name="aceite"]').check()
  volta = await mandar(pagina)
  const valeu = semEspaco(await pagina.locator("[data-inscricao-enviada]").textContent())
  ok(
    volta.enviada &&
      valeu.includes("Valeu, Criador!") &&
      valeu.includes("(47) 98888-7777") &&
      valeu.includes(`Fixo, ${reais(OFERTA.fixo * 100)}`),
    "certa: o 'valeu' com o nome, o WhatsApp e o modelo",
    valeu
  )
  // A rolagem é suave (menos pra quem pede menos movimento): espera ela chegar.
  const noTopo = await pagina
    .waitForFunction(
      () => {
        const r = document.querySelector("[data-inscricao-enviada]")?.getBoundingClientRect()
        return Boolean(r && r.top >= 0 && r.bottom <= innerHeight)
      },
      null,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false)
  ok(noTopo, "e a tela rola até o 'valeu'")
  const [nobanco] = await doBanco()
  ok(
    nobanco?.email === EMAIL &&
      nobanco?.whatsapp === "47988887777" &&
      nobanco?.instagram === `criador.${RODADA}` &&
      nobanco?.video === "https://instagram.com/reel/teste123" &&
      nobanco?.barba === "media" &&
      nobanco?.modelo === "fixo" &&
      nobanco?.parceria === true &&
      nobanco?.situacao === "nova",
    "no banco, limpa: e-mail minúsculo, WhatsApp em dígitos, perfil sem link, vídeo com https",
    JSON.stringify(nobanco)
  )

  titulo("O pop-up da 1ª compra não cobre a proposta")
  await contexto.clearCookies({ name: SEM_POPUP.name })
  const semCupom = await contexto.newPage()
  await semCupom.goto(`${LOJA}/criadores`, { waitUntil: "load" })
  await semCupom.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await semCupom.waitForTimeout(2500)
  ok((await semCupom.locator(".pc-popup").count()) === 0, "rolou até o fim, e nada de pop-up")

  titulo("O celular")
  const cel = await novaAba({ width: 375, height: 812 })
  await cel.pagina.goto(`${LOJA}/criadores`, { waitUntil: "load" })
  const lados = await cel.pagina.evaluate(() => ({
    largura: document.documentElement.clientWidth,
    rolagem: document.documentElement.scrollWidth,
  }))
  ok(lados.rolagem <= lados.largura, "sem rolagem de lado", JSON.stringify(lados))
  const legendas = await cel.pagina.evaluate(() =>
    [...document.querySelectorAll("[data-inscricao] .criadores__grupo")].every((g) => {
      const l = g.querySelector("legend")?.getBoundingClientRect()
      const c = g.getBoundingClientRect()
      return l && Math.abs(l.top - c.top) < 2
    })
  )
  ok(legendas, "cada bloco do formulário com o título em cima dele")
} catch (err) {
  ok(false, "o conferidor quebrou", err instanceof Error ? err.stack : String(err))
} finally {
  for (const i of await doBanco().catch(() => []))
    for (const acao of ["recusar", "apagar"])
      await admin(`/admin/criadores/${i.id}`, { metodo: "POST", corpo: { acao } })
  for (const c of abas) await c.close().catch(() => {})
  await navegador.close()
}

ok((await doBanco()).length === 0, "a inscrição da rodada saiu do banco")
ok(
  noConsole.length === 0,
  "nenhum erro no console",
  [...new Set(noConsole.map((t) => t.split("\n")[0].slice(0, 160)))].slice(0, 3).join(" | ")
)

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
