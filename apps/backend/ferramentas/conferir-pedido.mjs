/**
 * Confere o PEDIDO INTEIRO pela API da loja, do carrinho vazio ao pedido
 * fechado — exatamente as chamadas que o checkout vai fazer, na ordem em que
 * vai fazer.
 *
 *   node ferramentas/conferir-pedido.mjs
 *
 * Existe porque desenhar tela de checkout em cima de um fluxo que nunca se viu
 * fechar é construir do telhado pra baixo. Aqui o fluxo fecha primeiro, sem
 * HTML no meio; a tela vem depois, sabendo o que cada passo exige e em que
 * ordem — e sabendo como o Medusa reclama quando falta alguma coisa, que é o
 * que a pessoa vai ler na tela.
 *
 * O pagamento é o `pp_system_default`: ele APROVA SEM COBRAR. Serve pra provar
 * o fluxo e não serve pra vender — é por isso que o botão da sacola continua
 * apontando pro /em-breve até o Pagar.me entrar.
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.
 */

import { readFileSync } from "node:fs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const PISO = 149.9

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

/** Devolve `{ ok, status, corpo }` — sem lançar, porque metade dos testes é sobre a recusa. */
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

/** Igual, mas explode no primeiro tropeço — pros passos que precisam dar certo. */
async function precisa(caminho, opcoes = {}) {
  const r = await api(caminho, opcoes)
  if (!r.ok) {
    throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${JSON.stringify(r.corpo)}`)
  }
  return r.corpo
}

if (!CHAVE) {
  console.error("Sem chave publicável. Passe NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.")
  process.exit(1)
}

/* ── o endereço de teste, em português e com os campos do Brasil ──────────── */

/**
 * O Medusa não tem campo pra BAIRRO nem pra NÚMERO — o modelo dele é o
 * endereço americano. Então:
 *
 * - o que a etiqueta e a lista de separação precisam ler de bate-pronto vai
 *   escrito em `address_1` e `address_2`, como um humano escreveria;
 * - o mesmo, quebrado em campos, vai em `metadata`, que é o que a NF-e e a
 *   cotação do Frenet vão querer depois.
 *
 * Escrever só bonito perde o dado; escrever só estruturado obriga quem for
 * imprimir a etiqueta a remontar a frase. Os dois custam um campo de texto.
 */
const ENDERECO = {
  first_name: "Matheus",
  last_name: "da Silva Teste",
  phone: "+5511999999999",
  address_1: "Rua das Flores, 123",
  address_2: "Apto 45 — Jardim Paulista",
  city: "São Paulo",
  province: "SP",
  postal_code: "01310-100",
  country_code: "br",
  metadata: {
    numero: "123",
    bairro: "Jardim Paulista",
    complemento: "Apto 45",
  },
}

/**
 * CPF/CNPJ vai no METADATA DO ENDEREÇO DE COBRANÇA, e isto não é gosto: o
 * `metadata` do CARRINHO é descartado no `complete` — o pedido nasce com
 * `metadata: null`. O do endereço sobrevive. Guardar o documento no carrinho
 * seria perder o documento exatamente na hora em que ele passa a valer, e
 * descobrir isso no dia de emitir a primeira nota.
 *
 * O endereço de cobrança também é o lugar certo por significado: o documento
 * identifica quem paga e sai na nota, não quem recebe a caixa.
 *
 * O teste lá embaixo prova as duas metades — que o do endereço chega e que o
 * do carrinho não chega — pra ninguém "simplificar" isso de volta.
 */
const DOCUMENTO = { tipo: "cpf", valor: "11144477735" } // CPF válido de teste
const EMAIL = "teste@fuckingbarba.invalid"

/* ── monta o carrinho ─────────────────────────────────────────────────────── */

const { regions } = await precisa("/store/regions")
const regiao = regions.find((r) => r.currency_code === "brl")

const { products } = await precisa(
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

/** Abaixo do piso de propósito: quero ver o frete COBRADO entrar no total. */
const comprado = [...variantes].filter((v) => v.preco < PISO).sort((a, b) => a.preco - b.preco)[0]

titulo(`O carrinho — 2× ${comprado.handle} (${reais(comprado.preco)} cada)`)
const { cart: cru } = await precisa("/store/carts", {
  method: "POST",
  corpo: { region_id: regiao.id },
})
await precisa(`/store/carts/${cru.id}/line-items`, {
  method: "POST",
  corpo: { variant_id: comprado.id, quantity: 2 },
})
ok(true, `carrinho ${cru.id} criado`)

/* ── 1. o Medusa recusa o que falta, e é isso que a tela vai mostrar ──────── */

/**
 * Repare na mensagem que vem nos três testes abaixo: é SEMPRE a mesma, sobre
 * pagamento, mesmo faltando e-mail, endereço e frete. O Medusa confere o
 * pagamento primeiro e desiste ali.
 *
 * Consequência pro checkout: a tela NÃO pode repassar o erro do Medusa pro
 * cliente e achar que está explicando o que falta — ela tem que saber, por
 * conta própria, em que etapa está e o que ainda não foi preenchido. O erro do
 * Medusa é a última rede, não o texto da tela.
 */
titulo("O que o Medusa exige antes de fechar")

const semNada = await api(`/store/carts/${cru.id}/complete`, { method: "POST" })
ok(!semNada.ok, "sem e-mail nem endereço nem frete, não fecha", `veio ${semNada.status}`)
console.log(`    → "${semNada.corpo?.message ?? "(sem mensagem)"}"`)

/* ── 2. contato e endereço ────────────────────────────────────────────────── */

titulo("Contato e entrega")
await precisa(`/store/carts/${cru.id}`, {
  method: "POST",
  corpo: {
    email: EMAIL,
    shipping_address: ENDERECO,
    // O documento não cabe num campo próprio: o schema de endereço do Medusa é
    // `.strict()` e não tem CPF. Vai no metadata do endereço de COBRANÇA.
    billing_address: { ...ENDERECO, metadata: { ...ENDERECO.metadata, documento: DOCUMENTO } },
    // De propósito, pra provar logo abaixo que ISTO SE PERDE.
    metadata: { some_no_complete: true },
  },
})

// Reler com `fields` explícito: a resposta do POST vem com os campos padrão, e
// `metadata` de endereço NÃO está entre eles. Ler o retorno do POST mentiria
// que o dado não foi salvo — e o checkout vai ter que pedir os campos igual.
const { cart: comEndereco } = await precisa(
  `/store/carts/${cru.id}?fields=id,email,metadata,*shipping_address,*billing_address`
)
ok(comEndereco.email === EMAIL, "o e-mail gruda no carrinho")
ok(
  comEndereco.shipping_address?.postal_code === ENDERECO.postal_code,
  "o CEP gruda no endereço de entrega"
)
ok(
  comEndereco.shipping_address?.metadata?.bairro === "Jardim Paulista",
  "o bairro sobrevive no metadata do endereço",
  "sem ele a etiqueta sai incompleta"
)
ok(
  comEndereco.billing_address?.metadata?.documento?.valor === DOCUMENTO.valor,
  "o CPF sobrevive no endereço de cobrança",
  "sem ele não sai nota fiscal"
)

const semFrete = await api(`/store/carts/${cru.id}/complete`, { method: "POST" })
ok(!semFrete.ok, "com endereço mas SEM FRETE, ainda não fecha", `veio ${semFrete.status}`)
console.log(`    → "${semFrete.corpo?.message ?? "(sem mensagem)"}"`)

/* ── 3. frete ─────────────────────────────────────────────────────────────── */

titulo("Frete")
const { shipping_options: opcoes } = await precisa(`/store/shipping-options?cart_id=${cru.id}`)
ok(opcoes.length > 0, "há opção de frete pra este endereço")
const frete = opcoes.find((o) => o.amount > 0) ?? opcoes[0]
await precisa(`/store/carts/${cru.id}/shipping-methods`, {
  method: "POST",
  corpo: { option_id: frete.id },
})
const { cart: comFrete } = await precisa(
  `/store/carts/${cru.id}?fields=id,item_total,shipping_total,total,*shipping_methods,*items`
)
ok(
  comFrete.shipping_total === frete.amount,
  `${frete.name} entra por ${reais(frete.amount)}`,
  `shipping_total = ${reais(comFrete.shipping_total)}`
)

const semPagamento = await api(`/store/carts/${cru.id}/complete`, { method: "POST" })
ok(!semPagamento.ok, "com frete mas SEM PAGAMENTO, ainda não fecha", `veio ${semPagamento.status}`)
console.log(`    → "${semPagamento.corpo?.message ?? "(sem mensagem)"}"`)

/* ── 4. pagamento ─────────────────────────────────────────────────────────── */

titulo("Pagamento")
const { payment_providers: provedores } = await precisa(
  `/store/payment-providers?region_id=${regiao.id}`
)
ok(provedores.length > 0, "a região tem provedor de pagamento")
console.log(`    → ${provedores.map((p) => p.id).join(", ")}`)

const { payment_collection: colecao } = await precisa("/store/payment-collections", {
  method: "POST",
  corpo: { cart_id: cru.id },
})
await precisa(`/store/payment-collections/${colecao.id}/payment-sessions`, {
  method: "POST",
  corpo: { provider_id: provedores[0].id },
})
ok(true, `sessão de pagamento criada em ${provedores[0].id}`)

/* ── 5. fecha ─────────────────────────────────────────────────────────────── */

titulo("O pedido")
const fechado = await precisa(`/store/carts/${cru.id}/complete`, { method: "POST" })
const pedido = fechado.order ?? fechado.cart
ok(fechado.type === "order", "o carrinho virou PEDIDO", `type = ${fechado.type}`)
ok(!!pedido?.display_id, `pedido #${pedido?.display_id}`)

const { order } = await precisa(
  `/store/orders/${pedido.id}?fields=id,display_id,email,total,item_total,shipping_total,metadata,` +
    `*items,*shipping_methods,*shipping_address,*billing_address`
)
ok(order.email === EMAIL, "o e-mail chegou no pedido")
ok(
  order.total === comFrete.total,
  "o total do pedido é o total que o carrinho mostrava",
  `pedido ${reais(order.total)} vs carrinho ${reais(comFrete.total)}`
)
ok(
  order.shipping_total === frete.amount,
  `o frete cobrado é ${reais(frete.amount)}`,
  `veio ${reais(order.shipping_total)}`
)
ok(
  order.billing_address?.metadata?.documento?.valor === DOCUMENTO.valor,
  "o CPF chegou no pedido, pelo endereço de cobrança",
  "é o que a nota fiscal vai usar"
)
ok(
  order.shipping_address?.metadata?.bairro === "Jardim Paulista",
  "o bairro chegou no pedido",
  "é o que a etiqueta vai usar"
)

// A outra metade da regra: o que o carrinho guardava em `metadata` NÃO chega.
// Se um dia este teste falhar, o Medusa mudou de ideia e dá pra simplificar —
// até lá, documento no carrinho é documento perdido.
ok(
  order.metadata?.some_no_complete === undefined,
  "o `metadata` do CARRINHO some no complete",
  `veio ${JSON.stringify(order.metadata)}`
)
console.log("    → é por isso que o documento mora no endereço, e não no carrinho")

/* ── 6. fechar duas vezes não cria dois pedidos ───────────────────────────── */

titulo("Clicar duas vezes em finalizar")
const denovo = await api(`/store/carts/${cru.id}/complete`, { method: "POST" })
const mesmoPedido = denovo.corpo?.order?.id ?? denovo.corpo?.data?.id
ok(
  mesmoPedido === order.id || !denovo.ok,
  "não nasce um segundo pedido",
  `veio ${denovo.status} ${mesmoPedido ?? ""}`
)
if (mesmoPedido === order.id) {
  console.log("    → o Medusa devolve o MESMO pedido, então o botão pode ser só idempotente")
} else {
  console.log(`    → o Medusa recusa: "${denovo.corpo?.message ?? ""}"`)
}

/* ── fim ──────────────────────────────────────────────────────────────────── */

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
