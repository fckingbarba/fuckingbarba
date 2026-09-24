/**
 * Confere a PDP PORTADA — a de verdade, servida pelo Next, ligada num Medusa.
 *
 *   node conferir-loja.mjs [url] [--fotos]
 *
 * O `conferir.mjs` ao lado mede o PROTÓTIPO. Este mede o que o cliente vai
 * receber, e a diferença entre os dois é o que o porte pode ter perdido no
 * caminho: token de cor trocado, regra de CSS que ficou fora do recorte,
 * seção que o registro não montou.
 *
 * As medidas da dobra são as mesmas que foram aprovadas no protótipo. Se uma
 * delas estourar aqui, ou o porte regrediu ou alguém mudou o desenho — nos
 * dois casos é pra olhar antes de subir.
 */

import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const URL_BASE = process.argv[2]?.startsWith("http")
  ? process.argv[2]
  : "http://localhost:3000/produtos/fator-de-crescimento-para-barba"
const TIRA_FOTOS = process.argv.includes("--fotos")
const PASTA = "saida/pdp-loja"

const CELULAR = { width: 390, height: 844 }
const MESA = { width: 1440, height: 900 }

let falhas = 0
let testes = 0

function ok(condicao, texto, detalhe = "") {
  testes++
  if (condicao) {
    console.log(`  ✓ ${texto}`)
  } else {
    falhas++
    console.log(`  ✗ ${texto}${detalhe ? ` — ${detalhe}` : ""}`)
  }
}

function titulo(t) {
  console.log(`\n${t}`)
}

/** `scroll-behavior: smooth` faz o scrollTo animar, e medir no meio da
 *  animação dá número errado. Daí o "instant" e a espera. */
async function aoTopo(pagina) {
  await pagina.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await pagina.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 })
  await pagina.waitForTimeout(300)
}

/*
 * Em máquina que já tem um Chromium (contêiner de CI, ambiente de agente), o
 * Playwright às vezes procura uma build que não está lá. `CHROMIUM=<caminho>`
 * aponta pro executável existente; sem a variável, o comportamento é o normal.
 */
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const contexto = await navegador.newContext({ viewport: CELULAR, deviceScaleFactor: 2 })
const pagina = await contexto.newPage()

const errosDeConsole = []
const respostasRuins = []
pagina.on("console", (m) => m.type() === "error" && errosDeConsole.push(m.text()))
pagina.on("response", (r) => r.status() >= 400 && respostasRuins.push(`${r.status()} ${r.url()}`))

console.log(`\n${URL_BASE}`)
await pagina.goto(URL_BASE, { waitUntil: "networkidle" })

/* ------------------------------------------------------------------ */
titulo("ESTRUTURA")

const h1s = await pagina.locator("h1").allTextContents()
ok(h1s.length === 1, `um <h1> só (achei ${h1s.length})`, h1s.join(" | "))

const niveis = await pagina.$$eval("h1,h2,h3,h4", (hs) =>
  hs.map((h) => Number(h.tagName[1]))
)
const pulo = niveis.findIndex((n, i) => i > 0 && n > niveis[i - 1] + 1)
ok(pulo === -1, "nenhum nível de título pulado", pulo > -1 ? `no ${pulo + 1}º` : "")

const semAlt = await pagina.$$eval("img", (is) =>
  is.filter((i) => i.getAttribute("alt") === null).map((i) => i.currentSrc || i.src)
)
ok(semAlt.length === 0, "toda <img> tem alt", semAlt.join(", "))

/* ------------------------------------------------------------------ */
titulo("PREÇO — a tela e o schema contam a mesma coisa")

const naTela = (await pagina.locator(".compra__por").first().textContent())?.trim()
const noSchema = await pagina.getAttribute('[itemprop="price"]', "content")
const soNumero = naTela?.replace(/[^\d,]/g, "").replace(",", ".")
ok(soNumero === Number(noSchema).toFixed(2), `${naTela} na tela = ${noSchema} no schema`)

const disp = await pagina.getAttribute('[itemprop="availability"]', "href")
ok(/InStock|OutOfStock/.test(disp ?? ""), `disponibilidade declarada (${disp})`)

/* ------------------------------------------------------------------ */
titulo("DEGRAU DE QUANTIDADE")

const kits = pagina.locator(".compra__kit")
const quantos = await kits.count()
ok(quantos >= 2, `${quantos} degraus vindos do catálogo`)

/* Só o texto direto do <span>: o "R$ 74,30 cada" mora num filho, e
   textContent traz os dois grudados ("R$ 222,90R$ 74,30 cada"). */
const precoDe = async (i) =>
  kits
    .nth(i)
    .locator(".compra__kit-preco")
    .evaluate((el) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
    )

const primeiro = await precoDe(0)
await kits.nth(quantos - 1).locator("input").check()
await pagina.waitForTimeout(150)
const grande = (await pagina.locator(".compra__por").first().textContent())?.trim()
ok(
  grande !== naTela,
  `escolher o último degrau muda o preço grande (${naTela} → ${grande})`
)

const ultimoCartao = await precoDe(quantos - 1)
ok(
  grande?.replace(/\s/g, "") === ultimoCartao?.replace(/\s/g, ""),
  `o preço grande bate com o do cartão escolhido (${grande} / ${ultimoCartao})`
)

// por unidade tem que cair conforme sobe a quantidade — é o argumento inteiro
const porUnidade = await pagina.$$eval(".compra__kit", (ls) =>
  ls.map((l) => {
    const u = l.querySelector(".compra__kit-unidade")?.textContent
    const p = l.querySelector(".compra__kit-preco")?.textContent
    const texto = u ?? p ?? ""
    return Number(texto.replace(/[^\d,]/g, "").replace(",", "."))
  })
)
const desce = porUnidade.every((v, i) => i === 0 || v <= porUnidade[i - 1])
ok(desce, `preço por frasco nunca sobe: ${porUnidade.join(" → ")}`)

await kits.nth(0).locator("input").check()
await pagina.waitForTimeout(150)
ok((await precoDe(0)) === primeiro, "voltar ao primeiro degrau devolve o preço original")

/* ------------------------------------------------------------------ */
titulo("A DOBRA — o botão tem que caber na primeira tela")

for (const [nome, tela] of [
  ["celular 390x844", CELULAR],
  ["mesa 1440x900", MESA],
]) {
  await pagina.setViewportSize(tela)
  await aoTopo(pagina)
  const y = await pagina.locator(".compra__comprar").evaluate((el) => {
    const r = el.getBoundingClientRect()
    return Math.round(r.top + window.scrollY + r.height)
  })
  ok(y <= tela.height, `${nome}: o botão termina em y=${y} (tela ${tela.height})`)
}

/* ------------------------------------------------------------------ */
titulo("LARGURA — nada pode estourar a tela do celular")

await pagina.setViewportSize(CELULAR)
await aoTopo(pagina)
const estouro = await pagina.evaluate(() => {
  const limite = document.documentElement.clientWidth
  /* Esteira e carrossel SÃO mais largos que a tela de propósito — o que não
     pode é isso vazar. Quem está dentro de um pai que corta no eixo x está
     contido, então o estouro dele não é estouro da página. */
  const contido = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX
      if (o === "hidden" || o === "auto" || o === "scroll" || o === "clip") return true
    }
    return false
  }
  /* Painel fixo estacionado FORA da tela — a gaveta da sacola fechada — não
     é estouro: ele está deslizado pra direita de propósito, esperando abrir.
     Some do documento ele só sairia se fosse desmontado, e aí não animava. */
  const foraDeCena = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const e = getComputedStyle(p)
      if (e.position === "fixed" && p.getBoundingClientRect().left >= limite - 1) return true
    }
    return false
  }
  const nome = (el) =>
    typeof el.className === "string" && el.className ? el.className : el.tagName.toLowerCase()
  return [...document.querySelectorAll("body *")]
    .filter(
      (el) =>
        Math.round(el.getBoundingClientRect().right) > limite + 1 &&
        !contido(el) &&
        !foraDeCena(el)
    )
    .slice(0, 4)
    .map((el) => `${nome(el)} (${Math.round(el.getBoundingClientRect().right)}px)`)
})
ok(estouro.length === 0, `sem estouro de largura em ${CELULAR.width}px`, estouro.join(", "))

const rolaDeLado = await pagina.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
)
ok(!rolaDeLado, "a página não rola de lado")

/* ------------------------------------------------------------------ */
titulo("FOTOS — todas têm que carregar de verdade")

/*
 * `naturalWidth === 0` é imagem que não chegou: URL errada, arquivo que
 * sumiu do Storage, handle de conteúdo apontando pra produto inexistente.
 * Na tela isso vira uma moldura vazia, que passa despercebido numa revisão
 * rápida e é péssimo numa página de produto.
 *
 * Rola a página inteira antes de medir: quase toda foto abaixo da dobra é
 * `loading="lazy"` e só começa a baixar quando entra em cena.
 */
await pagina.evaluate(async () => {
  const passo = window.innerHeight
  for (let y = 0; y < document.body.scrollHeight; y += passo) {
    window.scrollTo({ top: y, behavior: "instant" })
    await new Promise((r) => setTimeout(r, 120))
  }
  window.scrollTo({ top: 0, behavior: "instant" })
})
await pagina.waitForTimeout(1200)

const quebradas = await pagina.$$eval("img", (imgs) =>
  imgs
    .filter((i) => !i.complete || i.naturalWidth === 0)
    .map((i) => (i.currentSrc || i.src || "(sem src)").split("/").pop())
)
const quantasFotos = await pagina.locator("img").count()
ok(quebradas.length === 0, `as ${quantasFotos} fotos da página carregaram`, quebradas.join(", "))

/* ------------------------------------------------------------------ */
titulo("BARRA FIXA")

const barra = pagina.locator(".barra-compra")
/* Ela EXISTE sempre no DOM: `visibility: hidden` já a tira do Tab e do leitor
   de tela, e manter o elemento é o que deixa a entrada deslizar em vez de
   piscar. O que se confere é o estado, não a existência. */
ok(!(await barra.isVisible()), "escondida no topo")
await pagina.evaluate(() => window.scrollBy({ top: 1400, behavior: "instant" }))
await pagina.waitForTimeout(400)
ok(await barra.isVisible(), "aparece depois que o botão sai de vista")
ok(
  await barra.locator("button").isVisible(),
  "e o botão dela é alcançável — não é barra decorativa"
)

await aoTopo(pagina)
await pagina.waitForTimeout(500)
ok(!(await barra.isVisible()), "some ao voltar pro topo")
ok(
  (await barra.evaluate((el) => getComputedStyle(el).visibility)) === "hidden",
  "e some com visibility:hidden — fora do Tab e do leitor de tela"
)

/* ------------------------------------------------------------------ */
titulo("ZOOM DA FOTO")

await pagina.locator(".galeria__palco").click()
await pagina.waitForTimeout(350)
const zoom = pagina.locator(".galeria__zoom")
ok(await zoom.isVisible(), "abre no clique da foto")
const cabe = await zoom.evaluate((el) => {
  const r = el.getBoundingClientRect()
  return r.height <= window.innerHeight + 1 && r.width <= window.innerWidth + 1
})
ok(cabe, "a foto ampliada cabe na tela, sem scroll")
await pagina.keyboard.press("Escape")
await pagina.waitForTimeout(250)
ok(!(await zoom.isVisible()), "Esc fecha")

/* ------------------------------------------------------------------ */
titulo("COMPRAR — o clique tem que chegar no Medusa")

/*
 * O teste de verdade não é "apareceu 'na sacola'": é abrir o carrinho no
 * Medusa e ver QUAL variante entrou e em que quantidade. Todo o motivo de os
 * kits existirem como produto é que a página e o carrinho falem o mesmo
 * preço — conferir só a mensagem na tela deixaria passar exatamente o erro
 * que isso tudo existe pra impedir.
 */
await aoTopo(pagina)
await kits.nth(quantos - 1).locator("input").check()
await pagina.locator('.compra__qtd button[aria-label="Aumentar quantidade"]').click()
await pagina.locator(".compra__comprar").click()
// Deu certo: a gaveta abre com o item, e a página não repete (o recado é só pro erro).
await pagina.waitForSelector(".sacolinha__item", { timeout: 15000 })
const recado = (await pagina.locator(".compra__recado").textContent())?.trim()
ok(recado === "", `a sacola abre, sem recado na página ("${recado}")`)

const cookies = await contexto.cookies()
const idCarrinho = cookies.find((c) => c.name === "carrinho")?.value
ok(Boolean(idCarrinho), "o carrinho ficou no cookie")

if (idCarrinho) {
  const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
  const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
  const r = await fetch(`${MEDUSA}/store/carts/${idCarrinho}`, {
    headers: { "x-publishable-api-key": CHAVE },
  })
  const { cart } = await r.json()
  const linhas = cart?.items ?? []
  ok(linhas.length === 1, `uma linha no carrinho (${linhas.length})`)

  const escolhida = await kits.nth(quantos - 1).locator("input").getAttribute("value")
  const linha = linhas[0]
  ok(linha?.quantity === 2, `quantidade 2 (veio ${linha?.quantity})`)
  ok(
    /kit-3|kit-2/.test(linha?.product_handle ?? ""),
    `entrou o KIT, não o avulso (${linha?.product_handle}) — degrau de ${escolhida} frascos`
  )

  const cobrado = Number(linha?.unit_price ?? 0)
  const naPagina = Number(
    (await precoDe(quantos - 1)).replace(/[^\d,]/g, "").replace(",", ".")
  )
  ok(
    Math.abs(cobrado - naPagina) < 0.005,
    `o Medusa cobra o mesmo que a página mostra (${cobrado} × ${naPagina})`
  )
}

/* ------------------------------------------------------------------ */
titulo("CONSOLE E REDE")

ok(errosDeConsole.length === 0, "console limpo", errosDeConsole.slice(0, 3).join(" | "))
ok(respostasRuins.length === 0, "nenhuma resposta 4xx/5xx", respostasRuins.slice(0, 3).join(" | "))

/* ------------------------------------------------------------------ */
if (TIRA_FOTOS) {
  // A suíte deixou a gaveta aberta (ela abre sozinha ao adicionar). Fecha
  // antes de fotografar, senão toda revisão a olho vira revisão da gaveta.
  await pagina.keyboard.press("Escape")
  await pagina.waitForTimeout(600)
  mkdirSync(PASTA, { recursive: true })
  for (const [nome, tela] of [
    ["celular", CELULAR],
    ["mesa", MESA],
  ]) {
    await pagina.setViewportSize(tela)
    await aoTopo(pagina)
    await pagina.screenshot({ path: `${PASTA}/${nome}-dobra.png` })
    await pagina.screenshot({ path: `${PASTA}/${nome}-inteira.png`, fullPage: true })
  }
  console.log(`\nfotos em ${PASTA}/`)
}

console.log(`\n${testes - falhas}/${testes} passaram\n`)
await navegador.close()
process.exit(falhas ? 1 : 0)
