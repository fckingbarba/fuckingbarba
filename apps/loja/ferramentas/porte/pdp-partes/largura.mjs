/** Acha quem está estourando a largura da tela no celular. */
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const AQUI = dirname(fileURLToPath(import.meta.url))
const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 390, height: 900 } })
await pagina.goto("file://" + resolve(AQUI, "..", "prototipo-pdp.html"), {
  waitUntil: "networkidle",
})

const culpados = await pagina.evaluate(() => {
  const limite = document.documentElement.clientWidth
  const fora = []
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right > limite + 1 || r.left < -1) {
      // só o mais externo interessa; filho estoura porque o pai estoura
      if (fora.some((f) => f.el.contains(el))) continue
      fora.push({
        el,
        tag: el.tagName.toLowerCase(),
        cls: el.className && String(el.className).slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
      })
    }
  }
  return {
    limite,
    scroll: document.documentElement.scrollWidth,
    fora: fora.map(({ el, ...r }) => r),
  }
})

console.log("viewport", culpados.limite, "| scrollWidth", culpados.scroll)
console.table(culpados.fora)
await navegador.close()
