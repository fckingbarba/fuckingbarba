/**
 * CONFERIDOR DO FRETE COTADO.
 *
 *   FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste npm run backend:dev
 *   node ferramentas/conferir-frete.mjs
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 *            ADMIN_EMAIL, ADMIN_SENHA, PORTA_FALSA (padrão 4310).
 *
 * ┌─ POR QUE UMA FRENET FALSA, E NÃO A DE VERDADE ─────────────────────────┐
 * │ Cotar de verdade custa limite da conta, devolve preço diferente a cada │
 * │ dia — então nenhuma asserção sobre valor sobrevive — e, principalmente,│
 * │ não dá pra pedir que ela CAIA. E o caminho da queda é o mais           │
 * │ importante daqui: é o que decide se a loja continua vendendo ou não.   │
 * │                                                                         │
 * │ Então sobe um servidor que fala o formato deles (inclusive o           │
 * │ `ShippingSevicesArray` sem o "r") e responde o que este arquivo mandar:│
 * │ três transportadoras, nenhuma, erro 500, ou demora até estourar o      │
 * │ tempo. O Medusa não sabe a diferença.                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELE CONFERE QUE NENHUM OUTRO TESTE CONFERE ─────────────────────┐
 * │ O CORPO QUE SAIU DAQUI. A falsa guarda a última requisição, e o teste  │
 * │ lê dela o peso e as medidas que o backend mandou. É o único jeito de   │
 * │ pegar grama enviada como quilo: a cotação continuaria respondendo um   │
 * │ preço plausível, só que mil vezes errado, e nenhuma tela reclamaria.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Tudo que ele escreve (medidas das variantes, CEP do estoque, política de
 * frete) é restaurado no fim, inclusive se falhar no meio.
 */

import { MAIS_BARATA, MAIS_RAPIDA, PORTA_PADRAO, subirFrenetFalsa } from "./frenet-falsa.mjs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const EMAIL = process.env.ADMIN_EMAIL
const SENHA = process.env.ADMIN_SENHA

const CEP_DE_ORIGEM = "01310100" // Av. Paulista, só pra ter um CEP válido
const CEP_DE_DESTINO = "90010150"

let passou = 0
let falhou = 0
const confere = (nome, ok, detalhe = "") => {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

const falsa = await subirFrenetFalsa()
const servidor = { close: () => falsa.fechar() }
console.log(`  ⚙  Frenet falsa em http://127.0.0.1:${PORTA_PADRAO}/shipping/quote\n`)

/* ── conversa com o Medusa ───────────────────────────────────────────── */

if (!EMAIL || !SENHA) {
  console.log("  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — não dá pra montar o cenário")
  servidor.close()
  process.exit(1)
}

const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
})
if (!entrar.ok) throw new Error(`login do admin falhou: ${entrar.status}`)
const { token } = await entrar.json()
const cab = { "content-type": "application/json", authorization: `Bearer ${token}` }
const daLoja = { "content-type": "application/json", "x-publishable-api-key": CHAVE }

const adm = async (caminho, opcoes = {}) => {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: cab, ...opcoes })
  if (!r.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${await r.text()}`)
  return r.json()
}

/* ── o cenário ──────────────────────────────────────────────────────────
 *
 * Três coisas precisam existir pra uma cotação acontecer, e as três estão
 * vazias num banco recém-semeado. O teste monta e desmonta as três — é o
 * mesmo roteiro que o Matheus vai seguir em produção, só que automatizado.
 */
const desfazer = []

try {
  // 1. CEP no local de estoque
  const { stock_locations } = await adm("/admin/stock-locations?limit=1")
  const local = stock_locations[0]
  if (!local) throw new Error("nenhum local de estoque")
  const cepDeAntes = local.address?.postal_code ?? null

  await adm(`/admin/stock-locations/${local.id}`, {
    method: "POST",
    body: JSON.stringify({
      address: {
        address_1: local.address?.address_1 || "Endereço de teste",
        city: local.address?.city || "São Paulo",
        country_code: "br",
        postal_code: CEP_DE_ORIGEM,
      },
    }),
  })
  desfazer.push(async () => {
    if (cepDeAntes) {
      await adm(`/admin/stock-locations/${local.id}`, {
        method: "POST",
        body: JSON.stringify({ address: { ...local.address, postal_code: cepDeAntes } }),
      })
    }
  })

  // 2. peso e medida nas variantes
  const { products } = await adm("/admin/products?limit=50&fields=id,handle,*variants")
  const antesDasVariantes = []
  for (const p of products) {
    for (const v of p.variants ?? []) {
      antesDasVariantes.push({
        produto: p.id,
        id: v.id,
        weight: v.weight,
        length: v.length,
        width: v.width,
        height: v.height,
      })
      await adm(`/admin/products/${p.id}/variants/${v.id}`, {
        method: "POST",
        /* 250 g numa caixa de 20 × 15 × 8: números redondos, pra que a conta
           do teste seja conferível de cabeça (0,25 kg). */
        body: JSON.stringify({ weight: 250, length: 20, width: 15, height: 8 }),
      })
    }
  }
  desfazer.push(async () => {
    for (const v of antesDasVariantes) {
      await adm(`/admin/products/${v.produto}/variants/${v.id}`, {
        method: "POST",
        body: JSON.stringify({
          weight: v.weight,
          length: v.length,
          width: v.width,
          height: v.height,
        }),
      })
    }
  })

  // 3. a política de frete, que o teste vai trocar várias vezes
  const configAntes = (await adm("/admin/configuracoes")).configuracoes
  const gravarConfig = (mudanca) =>
    adm("/admin/configuracoes", {
      method: "POST",
      body: JSON.stringify({ ...configAntes, ...mudanca }),
    })
  desfazer.push(() => gravarConfig({}))

  // ── as opções de frete ────────────────────────────────────────────────
  const { shipping_options } = await adm("/admin/shipping-options?limit=50")
  const cotadas = shipping_options.filter((o) => o.provider_id === "frenet_frenet")
  confere(
    "existem duas opções cotadas pela Frenet",
    cotadas.length === 2,
    shipping_options.map((o) => `${o.name} (${o.provider_id}/${o.price_type})`).join(" | ")
  )
  confere(
    "e nenhuma opção fixa sobrou pra concorrer com elas",
    shipping_options.every((o) => o.provider_id === "frenet_frenet"),
    shipping_options
      .filter((o) => o.provider_id !== "frenet_frenet")
      .map((o) => o.name)
      .join(", ")
  )

  // ── um carrinho de verdade ────────────────────────────────────────────
  const { regions } = await (await fetch(`${MEDUSA}/store/regions`, { headers: daLoja })).json()
  const regiao = regions[0]
  const { products: doCatalogo } = await (
    await fetch(
      `${MEDUSA}/store/products?limit=1&region_id=${regiao.id}&fields=*variants.calculated_price`,
      { headers: daLoja }
    )
  ).json()
  const variante = doCatalogo[0].variants[0]

  async function carrinhoCom(quantidade) {
    const { cart } = await (
      await fetch(`${MEDUSA}/store/carts`, {
        method: "POST",
        headers: daLoja,
        body: JSON.stringify({ region_id: regiao.id }),
      })
    ).json()

    await fetch(`${MEDUSA}/store/carts/${cart.id}/line-items`, {
      method: "POST",
      headers: daLoja,
      body: JSON.stringify({ variant_id: variante.id, quantity: quantidade }),
    })
    const { cart: comEndereco } = await (
      await fetch(`${MEDUSA}/store/carts/${cart.id}`, {
        method: "POST",
        headers: daLoja,
        body: JSON.stringify({
          shipping_address: {
            first_name: "Teste",
            address_1: "Rua de teste, 1",
            city: "Porto Alegre",
            country_code: "br",
            province: "RS",
            postal_code: CEP_DE_DESTINO,
          },
        }),
      })
    ).json()
    return comEndereco
  }

  /*
    DUAS CHAMADAS, e é assim mesmo.

    `GET /store/shipping-options` LISTA as opções e devolve preço só das que
    têm preço no banco. Opção `calculated` não tem — quem sabe o preço dela é
    o provedor, e ele só é chamado pelo
    `POST /store/shipping-options/:id/calculate`, uma vez por opção.

    Custou uma rodada inteira de teste vermelho descobrir isso: a lista vinha
    com as duas entregas, sem `amount`, e a Frenet falsa registrava zero
    chamadas. Parecia provedor quebrado e era rota errada. O checkout da loja
    faz as duas chamadas pelo mesmo motivo.
  */
  const fretesDo = async (cart) => {
    const r = await fetch(`${MEDUSA}/store/shipping-options?cart_id=${cart.id}`, {
      headers: daLoja,
    })
    if (!r.ok) return { erro: r.status }
    const { shipping_options: lista } = await r.json()

    const opcoes = []
    for (const o of lista) {
      if (o.price_type !== "calculated") {
        opcoes.push(o)
        continue
      }
      const c = await fetch(`${MEDUSA}/store/shipping-options/${o.id}/calculate`, {
        method: "POST",
        headers: daLoja,
        body: JSON.stringify({ cart_id: cart.id, data: {} }),
      })
      if (!c.ok) return { erro: c.status, parcial: opcoes }
      const { shipping_option } = await c.json()
      opcoes.push(shipping_option)
    }
    return { opcoes }
  }

  /* ── 1. cotação normal ─────────────────────────────────────────────── */
  await gravarConfig({ frete: { modo: "nenhuma" }, cotacao: { precoDeEmergencia: null } })
  falsa.roteiro = "normal"
  falsa.chamadas = 0

  const carrinho = await carrinhoCom(1)
  const { opcoes } = await fretesDo(carrinho)
  const porNome = Object.fromEntries((opcoes ?? []).map((o) => [o.name, o.amount]))

  confere(
    "a econômica cobra o preço da transportadora mais barata",
    porNome["Entrega econômica"] === MAIS_BARATA,
    JSON.stringify(porNome)
  )
  confere(
    "a expressa cobra o da mais rápida, que não é a mais cara",
    porNome["Entrega expressa"] === MAIS_RAPIDA,
    JSON.stringify(porNome)
  )
  confere(
    "o serviço que veio com Error: true foi descartado",
    porNome["Entrega econômica"] !== 0,
    "preço zero significa que o serviço quebrado virou 'a mais barata'"
  )
  /*
    Duas opções, duas idas ao `/calculate` — e UMA cotação. O provedor junta
    as duas na mesma viagem (ver `deUmaViagemSo` no service). Sem isso, cada
    abertura da tela de entrega bateria duas vezes na Frenet: o dobro da
    espera do cliente e o dobro do consumo da conta.
  */
  confere(
    "duas opções, uma cotação só",
    falsa.chamadas === 1,
    `a Frenet foi chamada ${falsa.chamadas} vez(es) pra responder as duas opções`
  )

  /* ── 2. o corpo que saiu daqui ─────────────────────────────────────── */
  const corpo = falsa.ultimoCorpo ?? {}
  confere("o token vai no cabeçalho", Boolean(falsa.ultimoToken), String(falsa.ultimoToken))
  confere(
    "o CEP de origem é o do local de estoque",
    corpo.SellerCEP === CEP_DE_ORIGEM,
    String(corpo.SellerCEP)
  )
  confere(
    "o CEP de destino é o do endereço do carrinho",
    corpo.RecipientCEP === CEP_DE_DESTINO,
    String(corpo.RecipientCEP)
  )
  const item = (corpo.ShippingItemArray ?? [])[0] ?? {}
  confere(
    "o peso vai em QUILOS, não em gramas",
    item.Weight === 0.25,
    `mandou Weight: ${item.Weight} pra uma variante de 250 g`
  )
  confere(
    "as medidas vão em centímetros, como estão cadastradas",
    item.Length === 20 && item.Width === 15 && item.Height === 8,
    JSON.stringify(item)
  )
  confere(
    "o valor declarado é o dos produtos",
    Number(corpo.ShipmentInvoiceValue) > 0,
    String(corpo.ShipmentInvoiceValue)
  )

  /* ── 3. o mínimo dos Correios ──────────────────────────────────────── */
  await adm(`/admin/products/${doCatalogo[0].id}/variants/${variante.id}`, {
    method: "POST",
    body: JSON.stringify({ weight: 250, length: 5, width: 4, height: 1 }),
  })
  const miudo = await carrinhoCom(1)
  await fretesDo(miudo)
  const pequeno = (falsa.ultimoCorpo?.ShippingItemArray ?? [])[0] ?? {}
  confere(
    "caixa menor que o mínimo dos Correios é cotada pelo mínimo",
    pequeno.Length === 16 && pequeno.Width === 11 && pequeno.Height === 2,
    `mandou ${pequeno.Length}×${pequeno.Width}×${pequeno.Height} pra uma caixa de 5×4×1`
  )
  await adm(`/admin/products/${doCatalogo[0].id}/variants/${variante.id}`, {
    method: "POST",
    body: JSON.stringify({ weight: 250, length: 20, width: 15, height: 8 }),
  })

  /* ── 4. o frete grátis, na mais barata ─────────────────────────────── */
  await gravarConfig({
    frete: { modo: "gratis", piso: 1, alvo: "mais-barata", tetoDeCusto: null },
    cotacao: { precoDeEmergencia: null },
  })
  const comPromocao = await carrinhoCom(1)
  const { opcoes: promo } = await fretesDo(comPromocao)
  const p = Object.fromEntries((promo ?? []).map((o) => [o.name, o.amount]))
  confere(
    "acima do piso, a econômica sai de graça",
    p["Entrega econômica"] === 0,
    JSON.stringify(p)
  )
  confere(
    "e a expressa continua custando o preço cheio",
    p["Entrega expressa"] === MAIS_RAPIDA,
    "frete grátis é o envio comum por nossa conta, não a pressa de quem escolhe o rápido"
  )

  /* ── 5. abaixo do piso, ninguém ganha nada ─────────────────────────── */
  await gravarConfig({
    frete: { modo: "gratis", piso: 99999, alvo: "mais-barata", tetoDeCusto: null },
    cotacao: { precoDeEmergencia: null },
  })
  const abaixo = await carrinhoCom(1)
  const { opcoes: semPromo } = await fretesDo(abaixo)
  const sp = Object.fromEntries((semPromo ?? []).map((o) => [o.name, o.amount]))
  confere(
    "abaixo do piso, ninguém sai de graça",
    sp["Entrega econômica"] === MAIS_BARATA,
    JSON.stringify(sp)
  )

  /* ── 6. o teto de custo ────────────────────────────────────────────── */
  await gravarConfig({
    frete: { modo: "gratis", piso: 1, alvo: "mais-barata", tetoDeCusto: 10 },
    cotacao: { precoDeEmergencia: null },
  })
  const comTeto = await carrinhoCom(1)
  const { opcoes: teto } = await fretesDo(comTeto)
  const t = Object.fromEntries((teto ?? []).map((o) => [o.name, o.amount]))
  confere(
    "com teto de R$ 10, um frete de R$ 23,70 não sai de graça",
    t["Entrega econômica"] === MAIS_BARATA,
    `${JSON.stringify(t)} — o teto existe pra que "grátis no Acre" não coma a margem`
  )

  /* ── 7. a queda, com e sem socorro ─────────────────────────────────── */
  await gravarConfig({
    frete: { modo: "nenhuma" },
    cotacao: { precoDeEmergencia: 19.9 },
  })
  falsa.roteiro = "queda"
  const naQueda = await carrinhoCom(1)
  const { opcoes: emergencia } = await fretesDo(naQueda)
  const e = Object.fromEntries((emergencia ?? []).map((o) => [o.name, o.amount]))
  confere(
    "com a Frenet fora do ar, vale o preço de emergência",
    e["Entrega econômica"] === 19.9 && e["Entrega expressa"] === 19.9,
    JSON.stringify(e)
  )

  await gravarConfig({
    frete: { modo: "gratis", piso: 1, alvo: "mais-barata", tetoDeCusto: null },
    cotacao: { precoDeEmergencia: 19.9 },
  })
  const quedaComPromo = await carrinhoCom(1)
  const { opcoes: qp } = await fretesDo(quedaComPromo)
  const q = Object.fromEntries((qp ?? []).map((o) => [o.name, o.amount]))
  confere(
    "quem tinha frete grátis não perde por causa da queda",
    q["Entrega econômica"] === 0,
    `${JSON.stringify(q)} — o problema é nosso, não do cliente`
  )

  await gravarConfig({ frete: { modo: "nenhuma" }, cotacao: { precoDeEmergencia: null } })
  const semSocorro = await carrinhoCom(1)
  const resultado = await fretesDo(semSocorro)
  confere(
    "sem preço de emergência, a loja não oferece entrega nenhuma",
    resultado.erro !== undefined || (resultado.opcoes ?? []).length === 0,
    JSON.stringify(resultado).slice(0, 120)
  )

  /* ── 8. cotação vazia ──────────────────────────────────────────────── */
  falsa.roteiro = "vazia"
  await gravarConfig({ frete: { modo: "nenhuma" }, cotacao: { precoDeEmergencia: 19.9 } })
  const semCobertura = await carrinhoCom(1)
  const { opcoes: vazia } = await fretesDo(semCobertura)
  const v = Object.fromEntries((vazia ?? []).map((o) => [o.name, o.amount]))
  confere(
    "CEP sem transportadora nenhuma cai na emergência, não em frete zero",
    v["Entrega econômica"] === 19.9,
    JSON.stringify(v)
  )
} finally {
  for (const passo of desfazer.reverse()) {
    try {
      await passo()
    } catch (e) {
      console.log(`  ⚠  não consegui desfazer: ${e.message}`)
    }
  }
  console.log("\n  ↩  cenário restaurado")
  servidor.close()
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
