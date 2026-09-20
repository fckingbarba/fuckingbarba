/**
 * Confere o FRETE contra um Medusa de pé, pela API da loja.
 *
 *   node ferramentas/conferir-frete.mjs
 *
 * Existe porque o frete grátis do `src/scripts/frete.ts` não é promoção: é um
 * segundo preço da mesma opção, com regra em `item_total`. Esse mecanismo eu
 * li no validator do admin (`shipping-options/validators.js` só aceita
 * `attribute: "item_total"`) — ler não é provar. Aqui a loja monta carrinhos
 * de verdade e pergunta o frete como o checkout vai perguntar.
 *
 * O que cada teste compara é o que o Medusa devolve contra o preço que o
 * script cadastrou, nunca contra outra conta feita neste arquivo.
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.
 */

import { readFileSync } from "node:fs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"

/** Os mesmos números do `src/scripts/frete.ts`. Se lá mudar, aqui muda. */
const PISO = 149.9
const ESPERADO = { "Correios PAC": 24.9, "Correios Sedex": 39.9 }

const CHAVE =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
  (() => {
    try {
      const env = readFileSync(
        new URL("../../loja/.env.development.local", import.meta.url),
        "utf8"
      )
      return env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim() ?? ""
    } catch {
      return ""
    }
  })()

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
const reais = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    ...opcoes,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(opcoes.headers ?? {}),
    },
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${JSON.stringify(corpo)}`)
  }
  return corpo
}

if (!CHAVE) {
  console.error(
    "Sem chave publicável. Passe NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ou deixe o\n" +
      ".env.development.local da loja no lugar."
  )
  process.exit(1)
}

/* ── o catálogo, pra montar carrinhos com preço de verdade ────────────────── */

const { regions } = await api("/store/regions")
const regiao = regions.find((r) => r.currency_code === "brl")
if (!regiao) {
  console.error("Nenhuma região em BRL. Rode o produtos-iniciais antes.")
  process.exit(1)
}

const { products } = await api(
  `/store/products?limit=50&region_id=${regiao.id}&fields=handle,*variants.calculated_price`
)
const variantes = products
  .flatMap((p) =>
    p.variants.map((v) => ({
      handle: p.handle,
      id: v.id,
      preco: v.calculated_price?.calculated_amount,
    }))
  )
  .filter((v) => typeof v.preco === "number")

/** A variante mais barata que existe — pra chegar perto do piso sem passar. */
const maisBarata = [...variantes].sort((a, b) => a.preco - b.preco)[0]
/** Uma variante que sozinha já passa do piso. */
const cara = [...variantes].sort((a, b) => b.preco - a.preco)[0]
/** Uma que custa exatamente o piso, se houver — é o caso de borda do `gte`. */
const naBorda = variantes.find((v) => v.preco === PISO)

/**
 * Monta um carrinho com as linhas pedidas e devolve o carrinho e as opções de
 * frete que o Medusa oferece pra ele.
 */
async function carrinhoCom(linhas) {
  const { cart } = await api("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: regiao.id }),
  })
  for (const { id, quantidade } of linhas) {
    await api(`/store/carts/${cart.id}/line-items`, {
      method: "POST",
      body: JSON.stringify({ variant_id: id, quantity: quantidade }),
    })
  }
  const { cart: cheio } = await api(
    `/store/carts/${cart.id}?fields=id,item_total,subtotal,total,shipping_total,*items`
  )
  const { shipping_options: opcoes } = await api(`/store/shipping-options?cart_id=${cart.id}`)
  return { carrinho: cheio, opcoes }
}

const preco = (opcoes, nome) => opcoes.find((o) => o.name === nome)?.amount

/* ── 1. as opções existem, e cobram o que o script cadastrou ──────────────── */

titulo(`Abaixo do piso — 1× ${maisBarata.handle} (${reais(maisBarata.preco)})`)
const barato = await carrinhoCom([{ id: maisBarata.id, quantidade: 1 }])

ok(
  barato.carrinho.item_total < PISO,
  `o carrinho fica abaixo do piso`,
  `item_total = ${reais(barato.carrinho.item_total)}`
)
ok(
  barato.opcoes.length > 0,
  "a loja enxerga alguma opção de frete",
  "lista vazia = pedido impossível"
)
for (const [nome, valor] of Object.entries(ESPERADO)) {
  ok(
    preco(barato.opcoes, nome) === valor,
    `${nome} custa ${reais(valor)}`,
    `veio ${preco(barato.opcoes, nome) === undefined ? "nada" : reais(preco(barato.opcoes, nome))}`
  )
}
ok(
  barato.opcoes.every((o) => o.amount > 0),
  "nenhuma opção sai de graça abaixo do piso"
)

/* ── 2. acima do piso, a MESMA opção vai a zero ───────────────────────────── */

titulo(`Acima do piso — 1× ${cara.handle} (${reais(cara.preco)})`)
const rico = await carrinhoCom([{ id: cara.id, quantidade: 1 }])

ok(
  rico.carrinho.item_total > PISO,
  "o carrinho passa do piso",
  `item_total = ${reais(rico.carrinho.item_total)}`
)
for (const nome of Object.keys(ESPERADO)) {
  ok(
    preco(rico.opcoes, nome) === 0,
    `${nome} vira frete grátis`,
    `veio ${reais(preco(rico.opcoes, nome) ?? NaN)}`
  )
}
ok(
  rico.opcoes.length === barato.opcoes.length,
  "são as mesmas opções, não outras",
  `${barato.opcoes.length} abaixo, ${rico.opcoes.length} acima`
)

/* ── 3. a borda: o piso conta como grátis? (`gte` diz que sim) ────────────── */

if (naBorda) {
  titulo(`Na borda — 1× ${naBorda.handle}, exatamente ${reais(PISO)}`)
  const borda = await carrinhoCom([{ id: naBorda.id, quantidade: 1 }])
  ok(
    borda.carrinho.item_total === PISO,
    "o carrinho fecha exatamente no piso",
    `item_total = ${reais(borda.carrinho.item_total)}`
  )
  const naoPaga = Object.keys(ESPERADO).every((n) => preco(borda.opcoes, n) === 0)
  ok(naoPaga, "o piso exato já é grátis (regra `gte`, e não `gt`)")
  console.log(
    `    → é por isso que a loja diz "a partir de ${reais(PISO)}", e não "acima de".\n` +
      `      Este produto custa o piso na bica: "acima de" descreveria errado\n` +
      `      justamente o carrinho mais provável de chegar lá.`
  )
} else {
  titulo(`Na borda — nenhuma variante custa exatamente ${reais(PISO)}, pulando`)
}

/* ── 4. dá pra escolher a opção e ela entra no total ──────────────────────── */

titulo("O método entra no carrinho")
const escolhido = rico.opcoes[0]
await api(`/store/carts/${rico.carrinho.id}/shipping-methods`, {
  method: "POST",
  body: JSON.stringify({ option_id: escolhido.id }),
})
const { cart: comFrete } = await api(
  `/store/carts/${rico.carrinho.id}?fields=id,item_total,total,shipping_total,*shipping_methods`
)
ok(comFrete.shipping_methods?.length === 1, `"${escolhido.name}" fica pendurado no carrinho`)
ok(
  comFrete.shipping_total === 0,
  "o frete some do total acima do piso",
  `shipping_total = ${reais(comFrete.shipping_total)}`
)
ok(
  comFrete.total === comFrete.item_total,
  "o total é só a mercadoria",
  `total ${reais(comFrete.total)} vs itens ${reais(comFrete.item_total)}`
)

const baratoEscolhido = barato.opcoes.find((o) => o.name === escolhido.name)
await api(`/store/carts/${barato.carrinho.id}/shipping-methods`, {
  method: "POST",
  body: JSON.stringify({ option_id: baratoEscolhido.id }),
})
const { cart: comFretePago } = await api(
  `/store/carts/${barato.carrinho.id}?fields=id,item_total,total,shipping_total`
)
ok(
  comFretePago.shipping_total === baratoEscolhido.amount,
  `abaixo do piso o mesmo método cobra ${reais(baratoEscolhido.amount)}`,
  `shipping_total = ${reais(comFretePago.shipping_total)}`
)
ok(
  Math.abs(comFretePago.total - (comFretePago.item_total + baratoEscolhido.amount)) < 0.005,
  "e ele entra no total"
)

/* ── fim ──────────────────────────────────────────────────────────────────── */

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
