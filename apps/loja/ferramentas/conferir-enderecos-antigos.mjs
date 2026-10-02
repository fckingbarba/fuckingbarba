/**
 * CONFERIDOR DOS ENDEREÇOS ANTIGOS — todo endereço que a loja da Nuvemshop
 * tinha leva à página certa da loja nova, com redirect permanente.
 *
 *   node ferramentas/conferir-enderecos-antigos.mjs [url-da-loja]
 *   SEM_PRODUTOS=1 node ferramentas/conferir-enderecos-antigos.mjs http://localhost:3060
 *
 * A lista é a do mapa do site da Nuvemshop (www.fuckingbarba.com.br/sitemap.xml,
 * em 26/09), mais os endereços do sistema dela: a busca, o carrinho e a
 * conta. Na virada o domínio passa pra loja nova, e cada um destes precisa
 * abrir alguma coisa — nunca "página não encontrada".
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • endereço antigo sem destino (404 depois da virada);                  │
 * │ • linha do `src/redirects.json` que leva pra página que não existe, ou │
 * │   pra outra linha (salto a mais);                                      │
 * │ • redirect temporário (o Google não passa a relevância);               │
 * │ • a query perdida no caminho (?utm_ — a atribuição da campanha) ou a   │
 * │   âncora (/duvidas#entrega);                                           │
 * │ • produto antigo que a loja nova não publica.                          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * OS PRODUTOS têm o mesmo endereço nas duas lojas (/produtos/<handle>): o
 * antigo, com a barra no fim, cai na página do produto pelo 308 que o Next
 * faz sozinho. Isso depende do catálogo — rode contra a loja no ar. No banco
 * local faltam produtos: `SEM_PRODUTOS=1` pula essa parte. O resto (o mapa)
 * roda igual nos dois.
 */

import { readFileSync } from "node:fs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const SEM_PRODUTOS = process.env.SEM_PRODUTOS === "1"
const { rotas: MAPA, prefixos: PREFIXOS } = JSON.parse(
  readFileSync(new URL("../src/redirects.json", import.meta.url), "utf8")
)

let passou = 0
let falhou = 0
function confere(nome, ok, detalhe = "") {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

/** Os 15 produtos do mapa do site da Nuvemshop, em 26/09. */
const PRODUTOS_DA_NUVEMSHOP = [
  "shampoo-para-barba",
  "balm-para-barba",
  "oleo-para-barba",
  "kit-completo-para-barba",
  "kit-shampoo-para-barba-duplo-fuckingbarba",
  "kit-hidratacao-fuckingbarba-shampoo-oleo",
  "kit-essencial-fuckingbarba-shampoo-balm",
  "fator-de-crescimento-para-barba",
  "kit-2-fator-de-crescimento-para-barba",
  "kit-3-fator-de-crescimento-para-barba",
  "kit-6-fator-de-crescimento-para-barba",
  "kit-fator-de-crescimento-para-barba-e-shampoo",
  "pasta-modeladora-matte-80g-fucking-barba",
  "pasta-modeladora-brilho-80g-fucking-barba",
  "spray-modelador-matte-100ml-fucking-barba",
]

/** O resto do mapa do site da Nuvemshop (com a barra no fim, como lá), e os endereços do sistema dela. */
const PAGINAS_DA_NUVEMSHOP = [
  "/",
  "/contato/",
  "/produtos/",
  "/quem-somos/",
  "/trocas-e-devolucoes/",
  "/politica-de-privacidade/",
  "/politica-de-envio/",
  "/kits-para-barba/",
  "/produtos-para-a-barba/",
  "/produtos-para-a-barba/balm/",
  "/produtos-para-a-barba/shampoo/",
  "/produtos-para-a-barba/oleo/",
  "/produtos-para-a-barba/fator-de-crescimento/",
  "/para-o-cabelo/",
  "/blog/",
  // o sistema: a busca (?q=, igual na loja nova), o carrinho e a conta
  "/search/?q=oleo",
  "/comprar/",
  "/account/",
  "/account/login/",
  "/account/register/",
  "/account/reset/",
]

/** A porta da /conta manda quem não entrou pro "entrar" — é o único temporário que vale. */
const PORTA_DA_CONTA = (de, para) =>
  de.pathname.startsWith("/conta") && para.pathname === "/conta/entrar"

/**
 * Pede o endereço e segue os redirects, um a um (a âncora não viaja no
 * pedido: fica na `Location`). Devolve cada salto e onde parou.
 */
async function seguir(caminho) {
  let url = new URL(caminho, LOJA)
  const saltos = []
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { redirect: "manual" })
    const local = r.headers.get("location")
    if (r.status < 300 || r.status >= 400 || !local) return { saltos, status: r.status, url }
    const para = new URL(local, url)
    saltos.push({ status: r.status, de: url, para })
    url = para
  }
  return { saltos, status: 0, url }
}

const emFrase = ({ saltos, status, url }) =>
  [
    ...saltos.map((s) => `${s.status} → ${s.para.pathname}${s.para.search}${s.para.hash}`),
    `${status} em ${url.pathname}`,
  ].join(" · ")

/** Só redirect permanente, a não ser a porta da conta. */
const soPermanentes = (saltos) =>
  saltos.every((s) => s.status === 301 || s.status === 308 || PORTA_DA_CONTA(s.de, s.para))

/* ── 1. cada endereço antigo abre alguma coisa ──────────────────────────── */

console.log(`\nOs endereços da Nuvemshop, na loja ${LOJA}\n`)
for (const caminho of PAGINAS_DA_NUVEMSHOP) {
  const r = await seguir(caminho)
  confere(
    `${caminho} abre (${r.url.pathname}${r.url.hash})`,
    r.status === 200 && soPermanentes(r.saltos),
    emFrase(r)
  )
}

/* ── 2. cada linha do mapa: 301 direto pro destino, com a query e a âncora ── */

console.log("\nO mapa (src/redirects.json)\n")
for (const [de, para] of Object.entries(MAPA)) {
  const destino = new URL(para, LOJA)
  // Como vem do Google ou de uma campanha: a barra no fim, e a query.
  const r = await seguir(`${de === "/" ? "" : de}/?utm_source=conferidor`)
  const doMapa = r.saltos.find((s) => s.status === 301)
  const antes = doMapa ? r.saltos.indexOf(doMapa) : -1
  confere(
    `${de} → ${para}`,
    Boolean(doMapa) &&
      // antes do 301, no máximo o 308 da barra final
      antes <= 1 &&
      r.saltos.slice(0, antes).every((s) => s.status === 308) &&
      doMapa.para.pathname === destino.pathname &&
      doMapa.para.hash === destino.hash &&
      doMapa.para.searchParams.get("utm_source") === "conferidor" &&
      soPermanentes(r.saltos) &&
      r.status === 200,
    emFrase(r)
  )
}
confere(
  "nenhuma linha do mapa leva pra outra linha (salto a mais)",
  Object.values(MAPA).every((para) => !(new URL(para, LOJA).pathname in MAPA)),
  Object.values(MAPA)
    .filter((para) => new URL(para, LOJA).pathname in MAPA)
    .join(", ")
)
confere(
  "todo endereço antigo que não é produto nem página igual está no mapa",
  PAGINAS_DA_NUVEMSHOP.every((c) => {
    const p = new URL(c, LOJA).pathname.replace(/\/+$/, "") || "/"
    return p in MAPA || ["/", "/contato", "/produtos"].includes(p)
  })
)

/*
  ── 2b. os prefixos: o checkout da Nuvemshop, com id e token no fim ────────
  Como chega da aba antiga recarregada (02/10, 2 visitas no 404): o token com
  maiúsculas e a barra no fim. Um salto só (o minúsculo viria antes, e seriam
  dois), permanente, com a query.
*/

console.log("\nOs prefixos (src/redirects.json)\n")
const DO_CHECKOUT_DA_NUVEMSHOP = {
  "/checkout/v3/": [
    "/checkout/v3/success/123456789/AbCdEf0123456789",
    "/checkout/v3/next/123456789/AbCdEf0123456789/",
    "/checkout/v3/start/123456789/AbCdEf0123456789",
  ],
}
for (const [de, para] of Object.entries(PREFIXOS)) {
  const destino = new URL(para, LOJA)
  const exemplos = DO_CHECKOUT_DA_NUVEMSHOP[de] ?? []
  confere(`${de} tem endereço de exemplo neste conferidor`, exemplos.length > 0)
  for (const caminho of exemplos) {
    const r = await seguir(`${caminho}?utm_source=conferidor`)
    const [salto] = r.saltos
    confere(
      `${caminho} → ${para}`,
      r.saltos.length === 1 &&
        salto.status === 301 &&
        salto.para.pathname === destino.pathname &&
        salto.para.hash === destino.hash &&
        salto.para.searchParams.get("utm_source") === "conferidor" &&
        r.status === 200,
      emFrase(r)
    )
  }
}
confere(
  "o checkout da loja nova não cai nos prefixos",
  Object.keys(PREFIXOS).every(
    (de) => !"/checkout/".startsWith(de) && !"/checkout/obrigado/".startsWith(de)
  )
)

/* ── 3. os produtos: o mesmo endereço, com a barra no fim ───────────────── */

if (SEM_PRODUTOS) {
  console.log("\nOs produtos: pulados (SEM_PRODUTOS=1) — rode contra a loja no ar\n")
} else {
  console.log("\nOs produtos (o mesmo endereço nas duas lojas)\n")
  for (const handle of PRODUTOS_DA_NUVEMSHOP) {
    const r = await seguir(`/produtos/${handle}/`)
    confere(
      `/produtos/${handle}/ abre a página do produto`,
      r.status === 200 && r.url.pathname === `/produtos/${handle}` && soPermanentes(r.saltos),
      emFrase(r)
    )
  }
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
