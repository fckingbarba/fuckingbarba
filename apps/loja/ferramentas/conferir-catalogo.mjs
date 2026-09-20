/**
 * CONFERIDOR DA TELA DE CATEGORIA
 *
 * Abre /barba, /cabelo, /kits e /produtos num navegador de verdade, contra um
 * Medusa de verdade, e compara CADA número da tela com o que a API responde —
 * nunca com outra conta feita aqui dentro. Conta que confere com ela mesma
 * passa mesmo quando as duas estão erradas.
 *
 *   node ferramentas/conferir-catalogo.mjs [url-da-loja]
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, CHROMIUM.
 *
 * Precisa da loja em http://localhost:3000 e do Medusa em :9000.
 * Use localhost, não 127.0.0.1: o `next dev` recusa POST de server action
 * vinda do IP (allowedDevOrigins), e a diferença só aparece quando alguém
 * acrescentar um teste que envia formulário.
 */

import { chromium } from "playwright"

/* Mesmos nomes de variável do conferir-checkout.mjs — dois conferidores da
   mesma pasta pedindo a chave com nomes diferentes é armadilha de graça. */
const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined

let passou = 0
let falhou = 0

function confere(nome, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok ? "" : `\n         esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`}`)
  ok ? passou++ : falhou++
}

const cabecalho = { "x-publishable-api-key": CHAVE }

/**
 * O catálogo como a API o vê, já sem os kits de quantidade.
 *
 * `region_id` é obrigatório: sem ele o Medusa recusa a requisição inteira com
 * "Missing required pricing context" em vez de devolver produto sem preço.
 * Preço no v2 é calculado por região, não é coluna.
 */
async function daApi() {
  const reg = await fetch(`${MEDUSA}/store/regions`, { headers: cabecalho })
  if (!reg.ok) throw new Error(`Medusa respondeu ${reg.status} nas regiões — confira a CHAVE`)
  const { regions } = await reg.json()
  const regiao = regions.find((r) => r.currency_code === "brl") ?? regions[0]
  if (!regiao) throw new Error("Nenhuma região no Medusa — rode o seed antes")

  const r = await fetch(
    `${MEDUSA}/store/products?limit=100&region_id=${regiao.id}` +
      `&fields=handle,title,metadata,*categories,*variants.calculated_price`,
    { headers: cabecalho }
  )
  if (!r.ok) throw new Error(`Medusa respondeu ${r.status} nos produtos`)
  const { products } = await r.json()
  return products.filter((p) => p.metadata?.tipo !== "kit-quantidade")
}

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
const erros = []
pagina.on("pageerror", (e) => erros.push(String(e)))

try {
  const catalogo = await daApi()
  const porCategoria = (handle) =>
    catalogo.filter((p) => (p.categories ?? []).some((c) => c.handle === handle))

  const preco = (p) =>
    Math.min(...(p.variants ?? []).map((v) => v.calculated_price?.calculated_amount ?? Infinity))

  console.log(`\nCatálogo na API: ${catalogo.length} produto(s), fora os kits de quantidade\n`)

  /* ── 1. cada categoria mostra exatamente os produtos daquela categoria ── */
  for (const handle of ["barba", "cabelo", "kits"]) {
    await pagina.goto(`${LOJA}/${handle}`, { waitUntil: "networkidle" })
    const naTela = await pagina.$$eval(".catalogo__grade .produto .produto__nome", (n) =>
      n.map((e) => e.textContent.trim())
    )
    const esperados = porCategoria(handle).map((p) => p.title)
    confere(
      `/${handle} mostra os ${esperados.length} produto(s) da categoria`,
      naTela.slice().sort(),
      esperados.slice().sort()
    )

    /* ── 2. o número do trilho bate com a grade ── */
    const trilhos = await pagina.$$eval(".trilho", (n) =>
      n.map((e) => [e.textContent.replace(/\s+/g, " ").trim(), e.classList.contains("trilho--ativo")])
    )
    const meu = trilhos.find(([t]) => t.toLowerCase().startsWith(handle === "kits" ? "kits" : handle))
    confere(`/${handle}: trilho diz ${esperados.length}`, meu?.[0], `${meu?.[0].split(" ")[0]} ${esperados.length}`)
    confere(`/${handle}: o trilho da própria categoria está marcado`, meu?.[1], true)

    /* ── 3. o trilho "Todos" conta o catálogo inteiro, sem kit de quantidade ── */
    const todos = trilhos.find(([t]) => t.toLowerCase().startsWith("todos"))
    confere(`/${handle}: trilho Todos diz ${catalogo.length}`, todos?.[0], `Todos ${catalogo.length}`)

    /* ── 4. categoria magra tem convite e saída; categoria cheia não ── */
    const temConvite = (await pagina.$(".convite")) !== null
    const temResto = (await pagina.$(".resto")) !== null
    confere(`/${handle}: convite ${esperados.length <= 2 ? "presente" : "ausente"}`, temConvite, esperados.length <= 2)
    confere(`/${handle}: resto da loja ${esperados.length <= 2 ? "presente" : "ausente"}`, temResto, esperados.length <= 2)

    /* ── 5. a barra de ordenação só existe quando há o que ordenar ── */
    const temBarra = (await pagina.$(".catalogo__barra")) !== null
    confere(`/${handle}: barra de ordenação ${esperados.length >= 2 ? "presente" : "ausente"}`, temBarra, esperados.length >= 2)
  }

  /* ── 6. /produtos mostra a loja inteira ── */
  await pagina.goto(`${LOJA}/produtos`, { waitUntil: "networkidle" })
  const todosNaTela = await pagina.$$eval(".catalogo__grade .produto .produto__nome", (n) =>
    n.map((e) => e.textContent.trim())
  )
  confere("/produtos mostra o catálogo inteiro", todosNaTela.length, catalogo.length)

  /* ── 7. nenhum kit de quantidade vaza pra vitrine ── */
  confere(
    "/produtos não mostra kit de quantidade",
    todosNaTela.some((t) => /\b2 frascos|\b3 frascos/i.test(t)),
    false
  )

  /* ── 8. a ordenação ordena DE VERDADE, e o preço da tela é o da API ── */
  const emOrdem = async (ordem) => {
    await pagina.goto(`${LOJA}/produtos?ordem=${ordem}`, { waitUntil: "networkidle" })
    return pagina.$$eval(".catalogo__grade .produto .produto__por", (n) =>
      n.map((e) => Number(e.textContent.replace(/[^\d,]/g, "").replace(",", ".")))
    )
  }

  const baratos = await emOrdem("barato")
  confere("?ordem=barato sobe o preço a cada card", baratos, baratos.slice().sort((a, b) => a - b))
  confere(
    "?ordem=barato começa no preço mais barato da API",
    baratos[0],
    Math.min(...catalogo.map(preco))
  )

  const caros = await emOrdem("caro")
  confere("?ordem=caro desce o preço a cada card", caros, caros.slice().sort((a, b) => b - a))
  confere("?ordem=caro começa no mais caro da API", caros[0], Math.max(...catalogo.map(preco)))

  /* ── 9. ordem inválida não quebra: vira relevância ── */
  await pagina.goto(`${LOJA}/produtos?ordem=chute`, { waitUntil: "networkidle" })
  confere(
    "?ordem=chute ainda desenha a lista inteira",
    (await pagina.$$(".catalogo__grade .produto")).length,
    catalogo.length
  )

  /* ── 10. a canônica ignora o ?ordem ── */
  await pagina.goto(`${LOJA}/produtos?ordem=caro`, { waitUntil: "networkidle" })
  const canonica = await pagina.getAttribute('link[rel="canonical"]', "href")
  confere("canônica de /produtos?ordem=caro aponta pra /produtos", canonica?.endsWith("/produtos"), true)

  /* ── 11. o select volta marcando a ordem em vigor ── */
  confere("o seletor volta marcando 'Maior preço'", await pagina.inputValue("#ordem"), "caro")

  /* ── 12. quem ordena é o SERVIDOR, e a prova é o HTML cru ───────────────
     Sem navegador nenhum: `fetch` no HTML e confere a ordem dos preços como
     eles saem do servidor. É o que garante que `?ordem=` é uma página de
     verdade — que dá pra mandar por link, que volta igual no botão voltar e
     que o Google lê — e não um embaralhamento que só existe depois que o
     JavaScript roda no navegador de quem abriu.

     ATENÇÃO ao que este teste NÃO diz: ele não diz que a tela aparece com o
     JavaScript desligado. Não aparece — e isso vale pra /barba, /produtos e
     também pra PDP, que é anterior a tudo isto. Com Cache Components, o que
     lê `searchParams` precisa ficar dentro de `<Suspense>`, e conteúdo em
     `<Suspense>` só é REVELADO pelo script embutido que o React manda junto.
     Sem script, ele fica no HTML mas escondido. Buscador enxerga (está no
     HTML, e os que rodam JS rodam o script); gente com JavaScript desligado
     vê o esqueleto. Está anotado no README. */
  const html = await (await fetch(`${LOJA}/produtos?ordem=barato`)).text()
  const precosNoHtml = [...html.matchAll(/produto__por"[^>]*>R\$\s*([\d.]+),(\d{2})/g)].map(
    (m) => Number(`${m[1].replace(/\./g, "")}.${m[2]}`)
  )
  confere(
    "o servidor entrega o HTML já ordenado por menor preço",
    precosNoHtml,
    precosNoHtml.slice().sort((a, b) => a - b)
  )
  confere("o HTML cru traz o catálogo inteiro (é o que o buscador lê)", precosNoHtml.length, catalogo.length)

  /* ── 13. a home leva pra /produtos, não pro /em-breve ── */
  await pagina.goto(LOJA, { waitUntil: "networkidle" })
  const verTodos = await pagina.getAttribute(".vitrine__rodape a", "href")
  confere('"Ver todos os produtos" aponta pra /produtos', verTodos, "/produtos")

  /* ── 14. nenhum erro de JavaScript em nenhuma das telas ── */
  confere("nenhum erro de JavaScript", erros, [])
} finally {
  await navegador.close()
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
