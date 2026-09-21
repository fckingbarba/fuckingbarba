import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

/**
 * OS PNGs DOS E-MAILS — a marca e dois ícones, em `public/email/`.
 *
 * E-mail não mostra SVG (o Gmail tira), então o que a loja desenha em vetor
 * vai pro e-mail em PNG. Este script desenha os PNGs A PARTIR DOS MESMOS
 * VETORES do site: a logo sai de `saida/logo.svg` (o traço do PNG original,
 * ver o README), e os ícones são os caminhos de `src/components/icones.tsx`.
 * Mudou a arte, roda de novo:
 *
 *   CHROMIUM=/opt/pw-browsers/chromium node ferramentas/logo/pngs-do-email.mjs
 *
 * EM 3x: o e-mail mostra a logo com 120 px de largura, e tela de celular tem
 * três pixels por pixel. Desenhar em 3x e mandar o `<img>` mostrar em 1x é o
 * que deixa a borda lisa no iPhone sem pesar (a logo sai com uns 20 KB).
 *
 * A LOGO VAI COM O FUNDO PRETO, e não transparente: o topo do e-mail é preto,
 * e PNG transparente em leitor de e-mail que inverte cores no modo escuro
 * vira letra branca em fundo branco. Com o fundo pintado, ela é sempre ela.
 */

const aqui = dirname(fileURLToPath(import.meta.url))
const destino = join(aqui, "../../public/email")

const ESCALA = 3
const TINTA_DO_BOTAO = "#07120e"
const MENTA_ESCURA = "#0b7f62"

/** Os caminhos de `icones.tsx` (viewBox 24x24). */
const RAIO = "M13 2 3 14h7l-1 8 10-12h-7l1-8z"
const ESCUDO_CERTO =
  "M4.6 3.9 12 1.6l7.4 2.3 1.4 1.4v4.8l-2 4.9L12 22.4l-6.8-7.4-2-4.9V5.3zM7.3 11.5l1.5-1.5h1.5l1.7 1.7 3.8-3.8h1.5l1.5 1.5-6.8 6.8z"

const icone = (d, cor) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${cor}" fill-rule="evenodd" d="${d}"/></svg>`

const pngs = [
  {
    arquivo: "logo.png",
    svg: await readFile(join(aqui, "saida/logo.svg"), "utf8"),
    largura: 120,
    altura: 96,
    fundo: "#000000",
  },
  { arquivo: "raio.png", svg: icone(RAIO, TINTA_DO_BOTAO), largura: 16, altura: 16, fundo: null },
  {
    arquivo: "confirmado.png",
    svg: icone(ESCUDO_CERTO, MENTA_ESCURA),
    largura: 48,
    altura: 48,
    fundo: null,
  },
]

await mkdir(destino, { recursive: true })
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const pagina = await navegador.newPage({ deviceScaleFactor: ESCALA })

for (const { arquivo, svg, largura, altura, fundo } of pngs) {
  const dado = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  await pagina.setContent(
    `<body style="margin:0;background:${fundo ?? "transparent"}">` +
      `<img id="a" src="${dado}" style="display:block;width:${largura}px;height:${altura}px;object-fit:contain">` +
      `</body>`
  )
  const png = await pagina.locator("#a").screenshot({ omitBackground: fundo === null, type: "png" })
  await writeFile(join(destino, arquivo), png)
  console.log(
    `public/email/${arquivo}: ${largura * ESCALA}x${altura * ESCALA}, ${png.length} bytes`
  )
}

await navegador.close()
