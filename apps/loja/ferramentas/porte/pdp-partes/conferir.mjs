/**
 * Confere o protótipo da PDP num navegador de verdade.
 *
 *     node pdp-partes/conferir.mjs
 *
 * Não é teste de unidade: é o passo que evita entregar uma página que
 * só parecia certa no editor. Ele abre o arquivo no Chromium e:
 *
 *   • falha se o console tiver erro ou se algum request morrer
 *   • confere a estrutura de títulos (um <h1> só, sem pular nível)
 *   • exercita o que tem JS: galeria, kit, quantidade, rotina, CEP,
 *     barra fixa e acordeão
 *   • tira foto em 390 px e 1440 px pra revisão a olho
 *
 * Precisa do Playwright, que NÃO é dependência do repositório (ele baixa
 * navegador e a CI nunca roda isto):  npm i -D playwright
 */

import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mkdirSync } from "node:fs"

const AQUI = dirname(fileURLToPath(import.meta.url))
const ARQUIVO = "file://" + resolve(AQUI, "..", "prototipo-pdp.html")
const FOTOS = resolve(AQUI, "..", "saida", "pdp")

let falhas = 0
const ok = (m) => console.log("  ok    " + m)
const falha = (m) => {
  falhas++
  console.log("  FALHA " + m)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
})
const pagina = await contexto.newPage()

const erros = []
pagina.on("console", (m) => m.type() === "error" && erros.push(m.text()))
pagina.on("pageerror", (e) => erros.push(String(e)))

const quebrados = []
pagina.on("requestfailed", (r) => quebrados.push(r.url()))
pagina.on("response", (r) => r.status() >= 400 && quebrados.push(r.status() + " " + r.url()))

await pagina.goto(ARQUIVO, { waitUntil: "networkidle" })

console.log("\nESTRUTURA")
{
  const h1 = await pagina.locator("h1").count()
  h1 === 1 ? ok("um <h1> só") : falha(`${h1} <h1> na página`)

  const niveis = await pagina.$$eval("h1,h2,h3,h4", (hs) =>
    hs.map((h) => ({ n: +h.tagName[1], t: h.textContent.trim().slice(0, 40) }))
  )
  let anterior = 0
  let pulo = null
  for (const { n, t } of niveis) {
    if (anterior && n > anterior + 1) pulo = `h${anterior} → h${n} em "${t}"`
    anterior = n
  }
  pulo ? falha("nível de título pulado: " + pulo) : ok(`${niveis.length} títulos, sem pular nível`)

  const semAlt = await pagina.$$eval("img:not([alt])", (i) => i.length)
  semAlt === 0 ? ok("toda <img> tem alt") : falha(`${semAlt} <img> sem alt`)

  const preco = await pagina.getAttribute("[data-preco-schema]", "content")
  const visivel = (await pagina.textContent("[data-preco-grande]")).replace(/\D/g, "")
  preco.replace(/\D/g, "") === visivel
    ? ok("schema:price bate com o preço na tela")
    : falha(`schema ${preco} ≠ tela ${visivel}`)
}

console.log("\nGALERIA")
{
  const antes = await pagina.getAttribute("#galeria-foto", "src")
  await pagina.locator(".galeria__mini").nth(1).click()
  const depois = await pagina.getAttribute("#galeria-foto", "src")
  antes !== depois ? ok("miniatura troca a foto grande") : falha("a foto não mudou")

  const atual = await pagina.locator('.galeria__mini[aria-current="true"]').count()
  atual === 1 ? ok("só uma miniatura marcada como atual") : falha(`${atual} miniaturas atuais`)

  await pagina.locator("[data-galeria-palco]").click()
  const aberto = await pagina.locator("[data-galeria-zoom]").evaluate((d) => d.open)
  aberto ? ok("zoom abre") : falha("o zoom não abriu")
  await pagina.keyboard.press("Escape")
  const fechado = await pagina.locator("[data-galeria-zoom]").evaluate((d) => !d.open)
  fechado ? ok("Esc fecha o zoom") : falha("Esc não fechou")
  await pagina.locator(".galeria__mini").nth(0).click()
}

console.log("\nKIT E QUANTIDADE")
{
  await pagina.locator('input[name="kit"][value="3"]').check()
  const grande = await pagina.textContent("[data-preco-grande]")
  const botao = await pagina.getAttribute("[data-pdp-comprar]", "data-produto-preco")
  const barra = await pagina.textContent("[data-barra-preco]")
  const rotina = await pagina.textContent("[data-rotina-valor]")

  grande.includes("222,90") ? ok("preço grande vira 222,90") : falha("preço grande: " + grande)
  botao === "222.90" ? ok("botão de compra leva 222.90") : falha("botão: " + botao)
  barra.includes("222,90") ? ok("barra fixa acompanha") : falha("barra: " + barra)
  rotina.includes("222,90") ? ok("rotina acompanha o kit") : falha("rotina: " + rotina)

  const parc = await pagina.textContent("[data-parcela]")
  parc.includes("74,30") ? ok("parcela recalculada (3x 74,30)") : falha("parcela: " + parc)

  await pagina.locator('input[name="kit"][value="1"]').check()

  const menos = pagina.locator('[data-qtd="-"]')
  ;(await menos.isDisabled()) ? ok("menos desligado em 1") : falha("menos deveria estar desligado")
  await pagina.locator('[data-qtd="+"]').click()
  const q = await pagina.inputValue("[data-qtd-campo]")
  q === "2" ? ok("mais sobe pra 2") : falha("quantidade: " + q)

  await pagina.locator("[data-pdp-comprar]").click()
  await pagina.waitForTimeout(900)
  const itens = await pagina.evaluate(() => window.FuckingBarba.carrinho.ler())
  const fator = itens.find((i) => i.id === "fator-1x")
  fator && fator.qtd === 2
    ? ok("comprar com qtd 2 põe 2 na sacola")
    : falha("sacola: " + JSON.stringify(itens))

  await pagina.evaluate(() => window.FuckingBarba.carrinho.definir([]))
  await pagina.locator('[data-qtd="-"]').click()
}

console.log("\nROTINA")
{
  const so = await pagina.textContent("[data-rotina-valor]")
  so.includes("79,90") ? ok("começa só com o produto da página") : falha("total: " + so)

  const frete0 = await pagina.textContent("[data-rotina-frete-texto]")
  frete0.includes("70,00") ? ok("faltam R$ 70,00 pro frete grátis") : falha("frete: " + frete0)

  const fixo = pagina.locator("[data-rotina-item][data-fixo]")
  await fixo.evaluate((i) => i.closest("label").click())
  ;(await fixo.isChecked()) ? ok("o item fixo não desmarca") : falha("o item fixo desmarcou")

  await pagina.locator("[data-rotina-item]:not([data-fixo])").nth(0).check()
  await pagina.locator("[data-rotina-item]:not([data-fixo])").nth(1).check()

  const total = await pagina.textContent("[data-rotina-valor]")
  total.includes("184,70") ? ok("os três somam R$ 184,70") : falha("total: " + total)

  const frete = await pagina.textContent("[data-rotina-frete-texto]")
  ;/liberado/i.test(frete) ? ok("frete grátis liberado") : falha("frete: " + frete)

  const rotulo = await pagina.textContent("[data-rotina-comprar]")
  rotulo.includes("3") ? ok('botão vira "Levar os 3"') : falha("botão: " + rotulo.trim())

  await pagina.locator("[data-rotina-comprar]").click()
  await pagina.waitForTimeout(500)
  const n = await pagina.evaluate(() => window.FuckingBarba.carrinho.ler().length)
  n === 3 ? ok("os 3 entram na sacola") : falha(`entraram ${n}`)
  await pagina.evaluate(() => window.FuckingBarba.carrinho.fechar())
  await pagina.evaluate(() => window.FuckingBarba.carrinho.definir([]))
}

console.log("\nFRETE NA PÁGINA")
{
  await pagina.fill("[data-frete-cep]", "01310100")
  const mascarado = await pagina.inputValue("[data-frete-cep]")
  mascarado === "01310-100" ? ok("máscara do CEP") : falha("CEP: " + mascarado)

  await pagina.locator("[data-frete-botao]").click()
  await pagina.waitForSelector("[data-frete-opcoes] li", { timeout: 4000 })
  const ops = await pagina.locator("[data-frete-opcoes] li").count()
  ops >= 2 ? ok(`${ops} linhas de frete`) : falha(`${ops} opções`)

  const html = await pagina.innerHTML("[data-frete-opcoes]")
  ;/Faltam/.test(html)
    ? ok("avisa quanto falta pro frete grátis, em vez de prometer")
    : falha("não avisou o que falta")
  ;/data-gratis/.test(html)
    ? falha("prometeu frete grátis com R$ 79,90")
    : ok("não prometeu grátis")

  await pagina.locator("[data-frete-erro]").isHidden()
  await pagina.fill("[data-frete-cep]", "123")
  await pagina.locator("[data-frete-botao]").click()
  const err = await pagina.textContent("[data-frete-erro]")
  err.includes("8") ? ok("CEP curto dá erro") : falha("erro: " + err)
}

console.log("\nDÚVIDAS")
{
  const alvo = pagina.locator(".duvidas__item").nth(1)
  await alvo.locator("summary").click()
  ;(await alvo.evaluate((d) => d.open)) ? ok("acordeão abre") : falha("não abriu")

  const perguntas = await pagina.$$eval(".duvidas__item summary", (s) =>
    s.map((x) => x.childNodes[0].textContent.trim())
  )
  const ld = await pagina.$eval('script[type="application/ld+json"]', (s) =>
    JSON.parse(s.textContent)
  )
  const noLd = ld.mainEntity.map((q) => q.name)
  const forasteiro = noLd.find((q) => !perguntas.includes(q))
  forasteiro
    ? falha("FAQ do schema não existe na página: " + forasteiro)
    : ok(`${noLd.length} perguntas no schema, todas na página`)
}

console.log("\nBARRA FIXA")
{
  // os blocos acima rolaram a página (clicar num acordeão traz o alvo
  // pra vista); volta pro topo antes de medir
  await pagina.evaluate(() => window.scrollTo(0, 0))
  await pagina.waitForTimeout(500)

  const escondida = await pagina
    .locator("[data-barra]")
    .evaluate((b) => getComputedStyle(b).visibility)
  escondida === "hidden" ? ok("escondida no topo") : falha("visibility: " + escondida)

  await pagina.locator("#duvidas").scrollIntoViewIfNeeded()
  await pagina.waitForTimeout(500)
  const visivel = await pagina
    .locator("[data-barra]")
    .evaluate((b) => getComputedStyle(b).visibility)
  visivel === "visible" ? ok("aparece depois de rolar") : falha("visibility: " + visivel)

  await pagina.evaluate(() => window.scrollTo(0, 0))
  await pagina.waitForTimeout(500)
  const sumiu = await pagina.locator("[data-barra]").evaluate((b) => getComputedStyle(b).visibility)
  sumiu === "hidden" ? ok("some ao voltar pro topo") : falha("visibility: " + sumiu)
}

console.log("\nESTOQUE")
{
  await pagina.evaluate(() => window.FuckingBarba.pdp.definirEstoque(2))
  const t = await pagina.textContent("[data-estoque] span")
  t.includes("2") ? ok("aviso com o número real") : falha("aviso: " + t)
  await pagina.evaluate(() => window.FuckingBarba.pdp.definirEstoque(40))
  ;(await pagina.locator("[data-estoque]").isHidden())
    ? ok("some com estoque folgado")
    : falha("continuou visível")
}

console.log("\nLARGURA")
{
  // Rolagem horizontal no celular é o defeito mais fácil de não ver e o
  // mais irritante de usar. Um <input> sem width já derrubou esta página
  // uma vez; daí em diante é o script que confere, não o olho.
  for (const largura of [360, 390, 768, 1024, 1440]) {
    await pagina.setViewportSize({ width: largura, height: 900 })
    await pagina.waitForTimeout(250)
    const rola = await pagina.evaluate(() => ({
      tela: document.documentElement.clientWidth,
      pagina: document.documentElement.scrollWidth,
    }))
    rola.pagina <= rola.tela
      ? ok(`${largura}px sem rolagem horizontal`)
      : falha(`${largura}px: página tem ${rola.pagina}px numa tela de ${rola.tela}px`)
  }
}

console.log("\nESTRUTURA DE GRID")
{
  /* Num container grid ou flex, CADA filho vira uma célula — inclusive
     um <strong> solto no meio de uma frase. Já quebrou o "Modo de uso"
     aqui: o <strong> virou célula própria e caiu por cima do número.
     A regra: container de duas colunas tem exatamente dois filhos em
     fluxo (o que está posicionado em absolute não conta). */
  const quebrados = await pagina.$$eval(
    ".funciona__passos li, .compra__kit, .rotina__item, .compra__acao, .barra-compra, .compra__cep",
    (els) =>
      els
        .map((el) => {
          const colunas = getComputedStyle(el).gridTemplateColumns.split(" ").length
          const filhos = [...el.children].filter(
            (c) => getComputedStyle(c).position !== "absolute"
          ).length
          const pseudo = getComputedStyle(el, "::before").content !== "none" ? 1 : 0
          return { cls: el.className || el.tagName, colunas, celulas: filhos + pseudo }
        })
        .filter((r) => r.celulas > r.colunas)
  )
  quebrados.length
    ? falha(`${quebrados.length} grid com filho sobrando: ${JSON.stringify(quebrados[0])}`)
    : ok("nenhum grid com filho sobrando")
}

console.log("\nFOTOS")
mkdirSync(FOTOS, { recursive: true })
for (const [nome, largura] of [
  ["celular", 390],
  ["desktop", 1440],
]) {
  // página limpa: os blocos acima deixaram CEP digitado, acordeão aberto
  // e itens na sacola, e foto de revisão tem que mostrar o estado inicial
  await pagina.setViewportSize({ width: largura, height: 900 })
  await pagina.goto(ARQUIVO, { waitUntil: "networkidle" })

  // várias seções só aparecem quando entram na tela (o revelar da home,
  // que vale aqui também). Com fullPage o navegador NÃO rola, então sem
  // este passeio metade da página sai invisível na foto.
  await pagina.evaluate(async () => {
    const passo = window.innerHeight * 0.7
    for (let y = 0; y < document.documentElement.scrollHeight; y += passo) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 260))
    }
    // o passo do laço para antes do fim: sem esta descida até o pé, o
    // rodapé nunca entra na tela e sai branco na foto
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 500))
    window.scrollTo(0, 0)
  })
  await pagina.waitForTimeout(700)

  // se sobrou bloco escondido, a foto sai com buraco e eu ia "corrigir"
  // um layout que está certo — foi o que quase aconteceu com o título
  // dos relacionados
  const escondidos = await pagina.$$eval("[data-revela]:not(.e-visivel)", (els) =>
    els.map((e) => String(e.className).split(" ")[0])
  )
  escondidos.length
    ? falha(`${escondidos.length} bloco(s) não revelado(s) na foto: ${escondidos.join(", ")}`)
    : ok(`${nome}: todos os blocos revelados`)

  const destino = resolve(FOTOS, `${nome}.png`)
  await pagina.screenshot({ path: destino, fullPage: true })
  ok(`${nome} (${largura}px) → saida/pdp/${nome}.png`)
}

console.log("\nCONSOLE E REDE")
erros.length ? falha(erros.length + " erro(s): " + erros[0]) : ok("console limpo")
quebrados.length
  ? falha(quebrados.length + " request(s) com problema: " + quebrados[0])
  : ok("nenhum request quebrado")

await navegador.close()

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.")
process.exit(falhas ? 1 : 0)
