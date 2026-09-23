import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * O SERVIDOR DO LIGHTHOUSE, JÁ AQUECIDO — `next start` e uma passada em cada
 * página medida, e em cada foto delas, ANTES de o Lighthouse começar.
 *
 *   node ferramentas/servidor-aquecido.mjs     (quem chama é o lighthouserc.json)
 *
 * ┌─ POR QUE ──────────────────────────────────────────────────────────────┐
 * │ A primeira visita a um `next start` recém-subido paga o que o cliente  │
 * │ da Vercel nunca paga: o servidor carregando código e o otimizador de   │
 * │ imagem gerando cada foto pela primeira vez. No CI isso acontece na     │
 * │ mesma máquina de 2 núcleos em que o Chrome do Lighthouse está medindo, │
 * │ e caía em cheio na home, a primeira URL da lista: LCP de 2,56s e 2,68s │
 * │ no CI do #13, com a PDP (medida depois, servidor já quente) em 2,28s — │
 * │ e a mesma home em 2,18s aqui. Uma passada antes deixa as fotos prontas │
 * │ e o servidor carregado, e o Lighthouse mede a página, não a partida.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * As páginas saem do próprio lighthouserc.json (`collect.url`), pra lista
 * nunca divergir. "servidor aquecido" é o `startServerReadyPattern`: só é
 * dito depois da passada — o "Ready" do Next sai antes e não serve de aviso.
 */

const PORTA = 3100
const BASE = `http://localhost:${PORTA}`
// O Accept que o Chrome manda pra foto: o otimizador guarda um arquivo por
// formato, e aquecer o WebP não adianta nada se o Chrome vai pedir AVIF.
const ACEITA_FOTO = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"

const config = JSON.parse(readFileSync(new URL("../lighthouserc.json", import.meta.url), "utf8"))
const paginas = config.ci.collect.url.map((u) => {
  const url = new URL(u)
  return url.pathname + url.search
})

const servidor = spawn("npx", ["next", "start", "-p", String(PORTA)], {
  stdio: ["ignore", "inherit", "inherit"],
})
servidor.on("exit", (codigo) => process.exit(codigo ?? 1))
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    servidor.kill(sinal)
    process.exit(0)
  })
}

async function noAr() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  throw new Error("[servidor aquecido] o next start não respondeu em 60s")
}

await noAr()
for (const pagina of paginas) {
  const html = await (await fetch(BASE + pagina)).text()
  // Todas as larguras do srcset: qual o Chrome vai escolher depende da tela
  // que o Lighthouse simula, e errar a largura é aquecer a foto errada.
  const fotos = new Set(
    [...html.matchAll(/\/_next\/image\?[^"'\s,)]+/g)].map((m) => m[0].replaceAll("&amp;", "&"))
  )
  await Promise.all(
    [...fotos].map((foto) =>
      fetch(BASE + foto, { headers: { accept: ACEITA_FOTO } })
        .then((r) => r.arrayBuffer())
        .catch(() => null)
    )
  )
  console.error(`[servidor aquecido] ${pagina}: ${fotos.size} foto(s)`)
}
console.log("[servidor aquecido] pronto")
