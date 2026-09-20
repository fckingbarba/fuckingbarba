/**
 * Confere as PROMOÇÕES pela API da loja.
 *
 *   node ferramentas/conferir-promocoes.mjs
 *
 * O order bump da tela promete "de X por Y". Aqui a gente prova que o Medusa
 * cobra o Y — porque oferta anunciada vincula, e um desconto que só existe no
 * HTML é a diferença que o cliente descobre na fatura.
 *
 * Também trava o limite de uma unidade: sem ele, quem marca o bump e depois
 * sobe a quantidade leva o desconto em todas, e "só nessa tela" vira atacado.
 */

import { readFileSync } from "node:fs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"

/** O mesmo do `src/scripts/promocoes.ts` e do `conteudo/checkout.ts` da loja. */
const BUMP = { handle: "oleo-para-barba", codigo: "BUMP-OLEO", desconto: 20 }
/** Um produto qualquer que NÃO é o do bump, pra provar que o alvo é o alvo. */
const OUTRO = "shampoo-para-barba"

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
const perto = (a, b) => Math.abs(a - b) < 0.005

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    ...opcoes,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(opcoes.headers ?? {}),
    },
    ...(opcoes.corpo ? { body: JSON.stringify(opcoes.corpo) } : {}),
  })
  return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => ({})) }
}
async function precisa(caminho, opcoes = {}) {
  const r = await api(caminho, opcoes)
  if (!r.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status}`)
  return r.corpo
}

const { regions } = await precisa("/store/regions")
const regiao = regions.find((r) => r.currency_code === "brl")

async function varianteDe(handle) {
  const { products } = await precisa(
    `/store/products?handle=${handle}&region_id=${regiao.id}&fields=handle,*variants.calculated_price`
  )
  const v = products[0]?.variants?.[0]
  return v ? { id: v.id, preco: Number(v.calculated_price.calculated_amount) } : null
}

const doBump = await varianteDe(BUMP.handle)
const outro = await varianteDe(OUTRO)
if (!doBump) {
  console.error(`Não achei "${BUMP.handle}". Rode o produtos-iniciais.`)
  process.exit(1)
}

const CAMPOS = "id,item_total,item_subtotal,discount_total,total,*items,*promotions"

async function carrinho(linhas) {
  const { cart } = await precisa("/store/carts", {
    method: "POST",
    corpo: { region_id: regiao.id },
  })
  for (const { id, quantidade } of linhas) {
    await precisa(`/store/carts/${cart.id}/line-items`, {
      method: "POST",
      corpo: { variant_id: id, quantity: quantidade },
    })
  }
  return cart.id
}
const ler = async (id) => (await precisa(`/store/carts/${id}?fields=${CAMPOS}`)).cart
const aplicar = (id, codigos) =>
  api(`/store/carts/${id}/promotions`, { method: "POST", corpo: { promo_codes: codigos } })

/* ── 1. o desconto é o que a tela promete ─────────────────────────────────── */

titulo(`O bump — 1× ${BUMP.handle} (${reais(doBump.preco)})`)
const c1 = await carrinho([{ id: doBump.id, quantidade: 1 }])
const antes = await ler(c1)
ok(antes.discount_total === 0, "sem código, sem desconto")

await aplicar(c1, [BUMP.codigo])
const depois = await ler(c1)
const esperado = doBump.preco * (BUMP.desconto / 100)

ok(
  (depois.promotions ?? []).some((p) => p.code === BUMP.codigo),
  `${BUMP.codigo} grudou no carrinho`
)
ok(
  perto(Number(depois.discount_total), esperado),
  `o desconto é ${BUMP.desconto}% — ${reais(esperado)}`,
  `veio ${reais(depois.discount_total)}`
)
ok(
  perto(Number(depois.total), doBump.preco - esperado),
  `o total cai pra ${reais(doBump.preco - esperado)}`,
  `veio ${reais(depois.total)}`
)
console.log(`    → é este "por" que a tela pode escrever: ${reais(doBump.preco - esperado)}`)

/* ── 2. uma unidade só ────────────────────────────────────────────────────── */

titulo(`Duas unidades do mesmo produto`)
const c2 = await carrinho([{ id: doBump.id, quantidade: 2 }])
await aplicar(c2, [BUMP.codigo])
const dois = await ler(c2)
ok(
  perto(Number(dois.discount_total), esperado),
  "o desconto continua sendo de UMA unidade",
  `veio ${reais(dois.discount_total)} pra um esperado de ${reais(esperado)}`
)
console.log("    → sem o limite, 'só nessa tela' viraria desconto de atacado")

/* ── 3. o alvo é o alvo ───────────────────────────────────────────────────── */

if (outro) {
  titulo(`Outro produto no carrinho — ${OUTRO} (${reais(outro.preco)})`)
  const c3 = await carrinho([{ id: outro.id, quantidade: 1 }])
  const r = await aplicar(c3, [BUMP.codigo])
  const so = await ler(c3)
  ok(
    Number(so.discount_total) === 0,
    "o código não desconta um produto que não é o do bump",
    `veio ${reais(so.discount_total)} (resposta ${r.status})`
  )
}

/* ── 4. código que não existe ─────────────────────────────────────────────── */

titulo("Código inventado")
const c4 = await carrinho([{ id: doBump.id, quantidade: 1 }])
const inventado = await aplicar(c4, ["NAO-EXISTE-ISSO"])
const nada = await ler(c4)
ok(Number(nada.discount_total) === 0, "não desconta nada", `veio ${reais(nada.discount_total)}`)
ok(
  !(nada.promotions ?? []).some((p) => p.code === "NAO-EXISTE-ISSO"),
  "e não fica pendurado no carrinho",
  `resposta ${inventado.status}`
)
console.log(
  `    → o Medusa responde ${inventado.status} e ignora. Quem precisa dizer que o\n` +
    "      cupom não existe é a tela, conferindo se o código entrou na lista."
)

/* ── 5. tirar o código tira o desconto ────────────────────────────────────── */

titulo("Desmarcar o bump")
await api(`/store/carts/${c1}/promotions`, {
  method: "DELETE",
  corpo: { promo_codes: [BUMP.codigo] },
})
const semCupom = await ler(c1)
ok(
  Number(semCupom.discount_total) === 0,
  "o desconto sai junto",
  `veio ${reais(semCupom.discount_total)}`
)
ok(
  perto(Number(semCupom.total), doBump.preco),
  `o total volta pra ${reais(doBump.preco)}`,
  `veio ${reais(semCupom.total)}`
)

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
