/**
 * RETRATO DA FAIXA DE COOKIES — pra olhar, não pra passar ou falhar.
 *
 *   node ferramentas/retrato-consentimento.mjs
 *
 * Contra um `next build` + `next start`, como o `retrato-calculadora.mjs` (o
 * modo dev põe o indicador dele no canto de baixo, justo onde a faixa mora),
 * e com pelo menos uma integração ligada no painel: sem parceiro, não há faixa.
 *
 * Variáveis: LOJA_URL (padrão :3100), CHROMIUM, SAIDA e PRODUTO.
 *
 * Fotografa a faixa, sem resposta, nos lugares em que a tela tem outra coisa
 * presa embaixo: a PDP no celular (a barra de compra aparece de cara), a PDP
 * no computador rolada até a barra aparecer, e o checkout no celular (a barra
 * do total). Em cada foto diz se os botões da faixa e o da barra estão LIVRES:
 * o que o navegador acha no meio de cada botão é o próprio botão — é o que um
 * dedo encontraria ali.
 */

import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const LOJA = process.env.LOJA_URL ?? "http://127.0.0.1:3100"
const CROMO = process.env.CHROMIUM || undefined
const SAIDA = process.env.SAIDA ?? join(tmpdir(), "retratos-consentimento")
const PRODUTO = process.env.PRODUTO ?? "balm-para-barba"

const CELULAR = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
}
const COMPUTADOR = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

await mkdir(SAIDA, { recursive: true })
const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})

/** O que está no meio de cada elemento é ele mesmo (ou um filho dele)? */
async function livres(pagina, seletores) {
  return pagina.evaluate((lista) => {
    const saida = {}
    for (const sel of lista) {
      const el = [...document.querySelectorAll(sel)].find((e) => e.checkVisibility())
      if (!el) {
        saida[sel] = "não está na tela"
        continue
      }
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const achado = document.elementFromPoint(x, y)
      saida[sel] =
        y > innerHeight || y < 0
          ? "fora da tela"
          : achado && (achado === el || el.contains(achado))
            ? "livre"
            : `coberto por ${achado?.className || achado?.tagName}`
    }
    return saida
  }, seletores)
}

const FAIXA = [
  "[data-faixa-de-cookies] button:nth-of-type(1)",
  "[data-faixa-de-cookies] button:nth-of-type(2)",
]

async function foto(nome, opcoes, trabalho, seletores) {
  const contexto = await navegador.newContext(opcoes)
  const pagina = await contexto.newPage()
  await trabalho(pagina)
  await pagina.locator("[data-faixa-de-cookies]").waitFor({ timeout: 15000 })
  await pagina.waitForTimeout(700) // a barra desliza em 0,26 s; a faixa acompanha
  const arquivo = join(SAIDA, `${nome}.png`)
  await pagina.screenshot({ path: arquivo })
  const altura = await pagina.evaluate(
    () => document.querySelector("[data-faixa-de-cookies]")?.getBoundingClientRect().height ?? 0
  )
  console.log(`  📷 ${nome} — faixa com ${Math.round(altura)} px de altura`)
  for (const [sel, estado] of Object.entries(await livres(pagina, seletores)))
    console.log(`     ${estado === "livre" ? "✓" : "✗"} ${sel}: ${estado}`)
  await contexto.close()
}

const pdp = `${LOJA}/produtos/${PRODUTO}`

await foto(
  "pdp-celular",
  CELULAR,
  async (p) => {
    await p.goto(pdp)
    await p.locator(".barra-compra.e-visivel").waitFor({ timeout: 15000 })
  },
  [...FAIXA, ".barra-compra .btn"]
)

await foto(
  "pdp-computador",
  COMPUTADOR,
  async (p) => {
    await p.goto(pdp)
    await p.mouse.wheel(0, 1600)
    await p.locator(".barra-compra.e-visivel").waitFor({ timeout: 15000 })
  },
  [...FAIXA, ".barra-compra .btn"]
)

await foto(
  "checkout-celular",
  CELULAR,
  async (p) => {
    // Um item na sacola pelo botão da página, e o checkout.
    await p.goto(pdp)
    await p.locator(".compra__comprar").click()
    await p.waitForTimeout(1500)
    await p.goto(`${LOJA}/checkout`)
    await p.locator(".barra").waitFor({ timeout: 20000 })
  },
  [...FAIXA, ".barra .barra__btn"]
)

await navegador.close()
console.log(`\n  as fotos estão em ${SAIDA}`)
