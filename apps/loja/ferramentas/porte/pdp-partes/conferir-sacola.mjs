/**
 * Confere a GAVETA DA SACOLA contra uma loja de pé, ligada num Medusa.
 *
 *   node pdp-partes/conferir-sacola.mjs [url-da-pdp]
 *
 * O que interessa aqui não é o desenho — é que o que a gaveta mostra seja o
 * que o Medusa cobra, e que ela não quebre o teclado. Por isso cada número
 * na tela é conferido contra o carrinho lido direto da API, e não contra
 * outra conta feita neste arquivo.
 */

import { chromium } from "playwright"

const PDP =
  process.argv[2]?.startsWith("http") ??
  false
    ? process.argv[2]
    : "http://localhost:3000/produtos/fator-de-crescimento-para-barba"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CELULAR = { width: 390, height: 844 }

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

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const contexto = await navegador.newContext({ viewport: CELULAR })
const pagina = await contexto.newPage()

const errosDeConsole = []
pagina.on("console", (m) => m.type() === "error" && errosDeConsole.push(m.text()))

/** O carrinho como o Medusa o vê — a única fonte de verdade desta suíte. */
async function noMedusa() {
  const id = (await contexto.cookies()).find((c) => c.name === "carrinho")?.value
  if (!id) return null
  // sem `fields` o Medusa não devolve o total por linha, e é justamente
  // ele que precisa bater com o número da gaveta
  const campos = "id,subtotal,item_subtotal,total,*items"
  const r = await fetch(`${MEDUSA}/store/carts/${id}?fields=${campos}`, {
    headers: { "x-publishable-api-key": CHAVE },
  })
  const { cart } = await r.json()
  return cart ?? null
}

const gaveta = () => pagina.locator(".sacolinha")

/**
 * Fechada, a gaveta NÃO some do DOM: ela desliza pra fora com `translateX`,
 * pra poder voltar deslizando. Então `isVisible()` dá true nos dois estados —
 * o elemento tem caixa, só que fora da tela. O que vale medir é onde ela
 * está: dentro da janela ou passada da borda direita.
 */
const gavetaNaTela = () =>
  pagina.evaluate(() => {
    const el = document.querySelector(".sacolinha")
    if (!el) return false
    return el.getBoundingClientRect().left < window.innerWidth - 2
  })
const numeroNoCabecalho = () => pagina.locator(".cabecalho__contador").innerText()

console.log(`\n${PDP}`)
await pagina.goto(PDP, { waitUntil: "networkidle" })

/* ------------------------------------------------------------------ */
titulo("FECHADA")

ok(!(await gavetaNaTela()), "não aparece sozinha")
ok(
  (await gaveta().getAttribute("inert")) !== null,
  "está inerte — fora do Tab e do leitor de tela"
)
ok((await numeroNoCabecalho()).trim() === "0", "o cabeçalho começa em 0")

/* ------------------------------------------------------------------ */
titulo("ADICIONAR ABRE A GAVETA")

// 2 unidades do kit de 3 frascos: o caso que mais tem como dar errado
const kits = pagina.locator(".compra__kit")
await kits.nth((await kits.count()) - 1).locator("input").check()
await pagina.locator('.compra__qtd button[aria-label="Aumentar quantidade"]').click()
await pagina.locator(".compra__comprar").click()
await pagina.waitForTimeout(1500)

ok(await gavetaNaTela(), "abre sozinha depois de adicionar")
ok((await gaveta().getAttribute("inert")) === null, "e sai do inerte ao abrir")

const cart = await noMedusa()
ok(Boolean(cart), "existe carrinho no Medusa")

const unidades = (cart?.items ?? []).reduce((s, i) => s + i.quantity, 0)
ok((await numeroNoCabecalho()).trim() === String(unidades), `cabeçalho mostra ${unidades}`)
ok(
  (await pagina.locator(".sacolinha__qtd").innerText()).trim() === String(unidades),
  "e o topo da gaveta mostra o mesmo"
)

const so = (t) => Number(t.replace(/[^\d,]/g, "").replace(",", "."))
const totalNaTela = so(await pagina.locator(".sacolinha__soma-valor").innerText())
ok(
  Math.abs(totalNaTela - Number(cart.total)) < 0.005,
  `o total da gaveta é o total do Medusa (${totalNaTela} × ${cart.total})`
)

const parcialNaTela = so(await pagina.locator(".sacolinha__parcial").first().innerText())
ok(
  Math.abs(parcialNaTela - Number(cart.items[0].total)) < 0.005,
  `a linha mostra o total da linha do Medusa (${parcialNaTela} × ${cart.items[0].total})`
)

/* ------------------------------------------------------------------ */
titulo("MEDIDOR DE FRETE GRÁTIS")

const barra = pagina.locator(".sacolinha__frete-trilho")
const agora = Number(await barra.getAttribute("aria-valuenow"))
ok(agora >= 0 && agora <= 100, `aria-valuenow existe e é porcentagem (${agora})`)
const texto = await pagina.locator(".sacolinha__frete-texto").innerText()
ok(
  Number(cart.item_subtotal ?? cart.subtotal) >= 149.9
    ? /conta|conseguiu/i.test(texto)
    : /falta/i.test(texto),
  `o texto combina com o subtotal (${texto})`
)

/* ------------------------------------------------------------------ */
titulo("MEXER NA QUANTIDADE")

await pagina.locator('.sacolinha__passo[aria-label^="Aumentar"]').first().click()
await pagina.waitForTimeout(1500)
const depois = await noMedusa()
const novas = (depois?.items ?? []).reduce((s, i) => s + i.quantity, 0)
ok(novas === unidades + 1, `"+" subiu no Medusa (${unidades} → ${novas})`)
ok((await numeroNoCabecalho()).trim() === String(novas), "e o cabeçalho acompanhou")

/* ------------------------------------------------------------------ */
titulo("TECLADO")

await pagina.keyboard.press("Escape")
await pagina.waitForTimeout(500)
ok(!(await gavetaNaTela()), "Esc fecha")
ok((await gaveta().getAttribute("inert")) !== null, "e volta pro inerte")

await pagina.locator('.cabecalho__icone[aria-controls="carrinho-gaveta"]').click()
await pagina.waitForTimeout(600)
ok(await gavetaNaTela(), "o botão do cabeçalho reabre")
ok(
  await pagina.evaluate(() =>
    document.querySelector(".sacolinha")?.contains(document.activeElement)
  ),
  "o foco entra na gaveta ao abrir"
)

// o foco não pode escapar pro fundo inerte
await pagina.keyboard.down("Shift")
await pagina.keyboard.press("Tab")
await pagina.keyboard.up("Shift")
ok(
  await pagina.evaluate(() =>
    document.querySelector(".sacolinha")?.contains(document.activeElement)
  ),
  "Shift+Tab no primeiro item não escapa da gaveta"
)

/* ------------------------------------------------------------------ */
titulo("ESVAZIAR")

const linhas = await pagina.locator(".sacolinha__tira").count()
for (let i = 0; i < linhas; i++) {
  await pagina.locator(".sacolinha__tira").first().click()
  await pagina.waitForTimeout(1400)
}
ok(
  (await gaveta().getAttribute("data-vazio")) !== null,
  "a gaveta se marca como vazia"
)
ok(await pagina.locator(".sacolinha__vazio").isVisible(), "e o bloco de vazio aparece")
ok(
  !(await pagina.locator(".sacolinha__pe").isVisible()),
  "o pé com o Finalizar some — não dá pra finalizar sacola vazia"
)
ok((await numeroNoCabecalho()).trim() === "0", "o cabeçalho volta a 0")
const vazio = await noMedusa()
ok((vazio?.items ?? []).length === 0, "e o carrinho no Medusa está vazio de verdade")

/* ------------------------------------------------------------------ */
titulo("CONSOLE")
ok(errosDeConsole.length === 0, "sem erro no console", errosDeConsole.slice(0, 2).join(" | "))

console.log(`\n${testes - falhas}/${testes} passaram\n`)
await navegador.close()
process.exit(falhas ? 1 : 0)
