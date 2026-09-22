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
 * quatro páginas (as três legais e o /contato) é o dia em que a loja pode
 * abrir.
 */

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"

let passou = 0
let falhou = 0

function confere(nome, ok, detalhe = "") {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

/** As telas de onde vale colher link: é delas que sai a navegação do site. */
const SEMENTES = [
  "/",
  "/barba",
  "/produtos",
  "/privacidade",
  "/termos",
  "/trocas",
  "/contato",
  "/duvidas",
]

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
   linha saiu, e depois o "7 dias pra trocar ou devolver" do resumo também
   (escolha da loja). A página segue sendo a que o rodapé e o sitemap
   apontam — é ela que cumpre o dever de informar a desistência. */
const trocas = await pegar("/trocas")
confere("o /trocas responde 200", trocas.status === 200)

/* ── contato e dúvidas ──────────────────────────────────────────────────── */
/* As duas nasceram no lugar do /em-breve. O rodapé é de TODA página, então
   um link que voltasse pro andaime voltaria no site inteiro de uma vez. */
const home = await pegar("/")
confere(
  'o rodapé leva "Contato" e "Dúvidas frequentes" pras páginas, e não pro /em-breve',
  home.html.includes('href="/contato"') &&
    home.html.includes('href="/duvidas"') &&
    !/href="\/em-breve"[^>]*>(Contato|Dúvidas frequentes)</.test(home.html)
)

const contato = await pegar("/contato")
confere(
  "/contato tem <h1> e aponta pras dúvidas e pras trocas",
  /<h1[^>]*>/.test(contato.html) &&
    contato.html.includes('href="/duvidas"') &&
    contato.html.includes('href="/trocas"')
)

/* O FAQ que o Google lê (JSON-LD) e o que a tela mostra saem do MESMO array
   (`conteudo/duvidas.ts`). Se um dia alguém escrever uma segunda lista, é
   aqui que as duas se desencontram — e structured data que diz uma coisa
   com a página mostrando outra é penalização manual. */
const duvidas = await pegar("/duvidas")
const entidades = (t) =>
  t
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
const naTela = [...duvidas.html.matchAll(/<summary>([^<]+)<span/g)].map((m) => entidades(m[1]))
const faq = [...duvidas.html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .map((m) => JSON.parse(m[1]))
  .find((j) => j["@type"] === "FAQPage")
const noJsonLd = (faq?.mainEntity ?? []).map((q) => q.name)
confere(
  "/duvidas tem <h1>, perguntas na tela e aponta pro /contato",
  /<h1[^>]*>/.test(duvidas.html) && naTela.length > 0 && duvidas.html.includes('href="/contato"'),
  `${naTela.length} pergunta(s) na tela`
)
confere(
  "o JSON-LD das dúvidas tem exatamente as perguntas da tela, na mesma ordem",
  noJsonLd.length === naTela.length && noJsonLd.every((q, i) => q === naTela[i]),
  `tela: ${naTela.length}, JSON-LD: ${noJsonLd.length}`
)
/* O realce das respostas se escreve `*assim*`, e o `<Realce>` devolve o
   texto CRU quando os asteriscos não fecham par — em vez de adivinhar onde
   o negrito termina. Asterisco na tela é esse par quebrado. */
const respostas = [...duvidas.html.matchAll(/class="duvidas__resposta">(.*?)<\/div>/gs)]
  .map((m) => m[1])
  .join("")
confere(
  "nenhum asterisco de realce cru nas respostas",
  respostas.length > 0 && !respostas.includes("*"),
  "achei `*` numa resposta — algum `*realce*` do conteudo/duvidas.ts ficou sem par"
)

/* ── a busca e o blog ───────────────────────────────────────────────────── */
/* A lupa do cabeçalho mandava pro /em-breve, e o rodapé tinha "Blog" levando
   pro mesmo lugar. Os dois são de TODA página. */
confere(
  "a busca do cabeçalho vai pro /busca, e não pro /em-breve",
  home.html.includes('action="/busca"') && !/action="\/em-breve"/.test(home.html)
)
confere('o rodapé não tem mais "Blog"', !/>Blog</.test(home.html))

/* Busca interna fica fora do Google: página rasa que concorre com a
   categoria de verdade. `follow` continua, pros produtos serem achados. */
const buscaVazia = await pegar("/busca")
confere(
  "/busca responde 200, com noindex e o campo de busca",
  buscaVazia.status === 200 &&
    /<meta name="robots" content="noindex, follow"/.test(buscaVazia.html) &&
    /<input[^>]*name="q"/.test(buscaVazia.html),
  `veio ${buscaVazia.status}`
)

/* A busca de verdade: o primeiro produto da /produtos, procurado pela
   primeira palavra do endereço dele — que vem SEM acento ("oleo-para-barba"),
   então isto confere também que "oleo" acha "Óleo". */
const listaInteira = await pegar("/produtos")
const primeiro = listaInteira.html.match(/href="\/produtos\/([a-z0-9-]+)"/)?.[1]
if (primeiro) {
  const palavra = primeiro.split("-")[0]
  const achou = await pegar(`/busca?q=${encodeURIComponent(palavra)}`)
  confere(
    `buscar "${palavra}" acha o ${primeiro}`,
    achou.html.includes(`href="/produtos/${primeiro}"`)
  )
} else {
  console.log("  --   a /produtos veio sem produto: a busca por um produto real ficou sem conferir")
}
const nada = await pegar("/busca?q=zzqqxxkk")
confere(
  "busca sem resultado mostra o vazio, sem card de produto",
  nada.html.includes('class="vazio"') && !/href="\/produtos\/[a-z0-9-]+"/.test(nada.html)
)

/* ── relatório dos dados que ainda faltam ───────────────────────────────── */
const pendencias = []
for (const caminho of ["/privacidade", "/termos", "/trocas", "/contato"]) {
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
  console.log("     (intencional; some quando os dados reais entrarem no admin, em Configurações)")
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
