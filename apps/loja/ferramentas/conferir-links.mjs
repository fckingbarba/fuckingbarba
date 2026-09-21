/**
 * CONFERIDOR DE LINKS — nenhum link do site leva a 404.
 *
 *   node ferramentas/conferir-links.mjs [url-da-loja]
 *
 * Por que isto existe: a lista `PAGINAS_RAIZ` do `proxy.ts` é mantida à mão,
 * e o proxy roda ANTES do roteador — não dá pra derivar as rotas dela. Quem
 * criar uma página em `app/` e esquecer de anotar lá vê 404 só ao abrir a
 * URL: não no build, não no lint, não no typecheck. Já aconteceu com o
 * `/checkout`, e quase aconteceu de novo com o `/produtos`.
 *
 * Então em vez de mais um teste que sabe de uma página específica, este aqui
 * VARRE: junta todo `href` interno das telas principais e pede cada um. Ele
 * passa a cobrir sozinho qualquer página nova que apareça no menu ou no
 * rodapé, sem ninguém lembrar de vir aqui.
 *
 * Também confere que as páginas institucionais não foram ao ar com dado de
 * mentira — a tarja `data-pendente` é intencional enquanto CNPJ e telefone
 * não existem, e este conferidor só a RELATA. O dia em que ela sumir das
 * três páginas é o dia em que a loja pode abrir.
 */

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"

let passou = 0
let falhou = 0

function confere(nome, ok, detalhe = "") {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

/** As telas de onde vale colher link: é delas que sai a navegação do site. */
const SEMENTES = ["/", "/barba", "/produtos", "/privacidade", "/termos", "/trocas"]

async function pegar(caminho) {
  const r = await fetch(new URL(caminho, LOJA), { redirect: "manual" })
  return { status: r.status, html: r.status < 400 ? await r.text() : "" }
}

/**
 * Só link interno, e só o que é página. Âncora (`#sobre`) vira a página de
 * base; `mailto:`, `tel:` e link externo ficam de fora — quebra de link de
 * terceiro é problema do terceiro, e pedir a URL dele a cada rodada
 * transformaria o conferidor num monitor de site alheio.
 */
function linksInternos(html) {
  const achados = new Set()
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]
    if (!href.startsWith("/") || href.startsWith("//")) continue
    const semAncora = href.split("#")[0] || "/"
    achados.add(semAncora)
  }
  return achados
}

const todos = new Set()
for (const semente of SEMENTES) {
  const { status, html } = await pegar(semente)
  confere(`${semente} responde 200`, status === 200, `veio ${status}`)
  for (const l of linksInternos(html)) todos.add(l)
}

console.log(`\n${todos.size} caminho(s) distinto(s) achados na navegação\n`)

const quebrados = []
for (const caminho of [...todos].sort()) {
  const { status } = await pegar(caminho)
  if (status >= 400) quebrados.push(`${caminho} → ${status}`)
}
confere("nenhum link interno leva a 404", quebrados.length === 0, quebrados.join("\n         "))

/* ── as três institucionais existem e falam uma da outra ────────────────── */
for (const caminho of ["/privacidade", "/termos", "/trocas"]) {
  const { html } = await pegar(caminho)
  const outras = ["/privacidade", "/termos", "/trocas"].filter((c) => c !== caminho)
  confere(
    `${caminho} tem <h1> e aponta pras outras duas`,
    /<h1[^>]*>/.test(html) && outras.some((o) => html.includes(`href="${o}"`))
  )
  /* Nenhuma delas pode ir ao ar dizendo que o texto está em redação: era
     assim que /privacidade e /trocas estavam, e o checkout já pedia aceite
     da segunda no botão de fechar pedido. */
  confere(`${caminho} não diz mais "em redação"`, !/em reda[çc][ãa]o/i.test(html))
}

/* ── as regras de troca e devolução existem ─────────────────────────────── */
/* O checkout pedia aceite delas numa linha embaixo do botão de pagar; a
   linha saiu (o "7 dias pra trocar ou devolver" da faixa do passo 3 ficou),
   e a página segue sendo a que o rodapé e o sitemap apontam. */
const trocas = await pegar("/trocas")
confere("o /trocas responde 200", trocas.status === 200)

/* ── relatório dos dados que ainda faltam ───────────────────────────────── */
const pendencias = []
for (const caminho of ["/privacidade", "/termos", "/trocas"]) {
  const { html } = await pegar(caminho)
  /* `<span data-pendente` e não só `data-pendente`: o atributo cru aparece
     DUAS vezes por tarja — uma na marcação e outra no payload do React que
     vem embutido no mesmo HTML. Contar as duas relatava o dobro de
     pendências, que é o tipo de número errado que ninguém confere. */
  const quantas = [...html.matchAll(/<span data-pendente/g)].length
  if (quantas) pendencias.push(`${caminho}: ${quantas}`)
}
if (pendencias.length) {
  console.log(`\n  ⚠  tarjas de dado pendente no ar — ${pendencias.join(", ")}`)
  console.log("     (intencional; some quando CNPJ, telefone e prazos reais entrarem em lib/site.ts)")
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
