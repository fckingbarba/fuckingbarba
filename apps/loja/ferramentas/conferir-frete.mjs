/**
 * CONFERIDOR DO FRETE COTADO.
 *
 *   FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste npm run backend:dev
 *   npm run loja:dev
 *   node ferramentas/conferir-frete.mjs
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 *            ADMIN_EMAIL, ADMIN_SENHA, PORTA_FALSA (padrão 4310),
 *            LOJA (padrão http://localhost:3000) e CHROMIUM.
 *
 * Do 1 ao 9 é API pura. O 10 abre a SACOLA num Chromium e confere o bloco
 * "Frete e prazo": a entrega escolhida ali vira o frete do carrinho, o pé
 * da gaveta mostra o que o Medusa calculou, e o checkout abre com ela.
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

  /* ── 8. a rota da calculadora de CEP ───────────────────────────────── */
  /*
    A PDP e a sacola não usam a rota do Medusa: elas chamam `POST
    /store/frete`, que cota sem precisar de carrinho (a sacola manda o dela,
    e aí a pergunta sai dele — ver o 8½). Os dois caminhos precisam devolver
    o MESMO preço — senão a página de produto promete um valor e o checkout
    cobra outro, que é a divergência que esta integração inteira existe pra
    não ter.
  */
  falsa.roteiro = "normal"
  await gravarConfig({
    frete: { modo: "gratis", piso: 1, alvo: "mais-barata", tetoDeCusto: null },
    cotacao: { precoDeEmergencia: 19.9, prazoDeEmergencia: "7 dias úteis" },
  })

  const calcular = async (corpo) => {
    const r = await fetch(`${MEDUSA}/store/frete`, {
      method: "POST",
      headers: daLoja,
      body: JSON.stringify(corpo),
    })
    return { status: r.status, corpo: await r.json() }
  }

  const umItem = [{ variante_id: variante.id, quantidade: 1 }]

  const cotado = await calcular({ cep: "90010-150", itens: umItem })
  const daCalculadora = cotado.corpo?.frete?.opcoes ?? []
  confere(
    "a rota da calculadora responde 200",
    cotado.status === 200,
    JSON.stringify(cotado.corpo).slice(0, 120)
  )
  confere(
    "e devolve TRANSPORTADORA e PRAZO, que a rota do Medusa não devolve",
    daCalculadora.length === 2 &&
      daCalculadora[0].transportadora === "Correios" &&
      daCalculadora[0].prazo === "8 dias úteis",
    JSON.stringify(daCalculadora)
  )
  confere(
    "o preço da calculadora é o mesmo do checkout",
    daCalculadora[0]?.preco === 0,
    `${daCalculadora[0]?.preco} — acima do piso, a econômica é grátis dos dois lados`
  )
  /*
    O PREÇO CHEIO é o que a sacola risca ao lado do "Grátis". Ele só existe
    nesta rota — o Medusa devolve o zero e esquece o resto —, e só quando a
    política baixou o preço: riscar na expressa um número igual ao do lado
    não diria nada.
  */
  confere(
    "e manda o preço cheio de quem ficou de graça, pra sacola riscar",
    daCalculadora[0]?.precoCheio === MAIS_BARATA && daCalculadora[1]?.precoCheio === null,
    JSON.stringify(daCalculadora.map((o) => [o.nome, o.preco, o.precoCheio]))
  )
  confere(
    "CEP com hífen e sem hífen dão a mesma resposta",
    (await calcular({ cep: "90010150", itens: umItem })).corpo?.frete?.cep === "90010150"
  )

  const torto = await calcular({ cep: "123", itens: umItem })
  confere(
    "CEP curto é recusado antes de gastar cotação",
    torto.status === 400,
    String(torto.status)
  )

  const semNada = await calcular({ cep: "90010150", itens: [] })
  confere("pedido sem item é recusado", semNada.status === 400, String(semNada.status))

  /*
    O NAVEGADOR NÃO DIZ QUANTO GASTOU. Mandar `region_id` de brincadeira não
    pode virar frete grátis: quem soma o subtotal é o servidor, pelos preços
    da região. Se um dia alguém aceitar um `subtotal` do corpo, isto quebra.
  */
  const mentindo = await calcular({
    cep: "90010150",
    itens: [{ variante_id: variante.id, quantidade: 1, preco: 99999, subtotal: 99999 }],
  })
  confere(
    "preço mandado pelo navegador é ignorado",
    mentindo.status === 200,
    "a rota não lê preço do corpo — quem soma é o servidor"
  )

  falsa.roteiro = "queda"
  const naQuedaDaRota = await calcular({ cep: "90010150", itens: umItem })
  const naEmergencia = naQuedaDaRota.corpo?.frete
  confere(
    "na queda, a calculadora diz o preço de emergência e o prazo do admin",
    naEmergencia?.emergencia === true && naEmergencia?.opcoes?.[0]?.prazo === "7 dias úteis",
    JSON.stringify(naEmergencia)
  )
  confere(
    "e não inventa quem entrega",
    naEmergencia?.opcoes?.[0]?.transportadora === null,
    "sem cotação ninguém sabe a transportadora — dizer uma seria mentira"
  )
  falsa.roteiro = "normal"

  /* ── 8½. a faixa de quantidade, pela sacola e pela PDP ────────────── */
  /*
    Com 2 unidades o carrinho cobra o preço da FAIXA de quantidade, e a
    rota tem que decidir o frete grátis sobre ele — perguntada pela sacola
    (com `cart_id`) e pela PDP (sem) —, e não sobre o preço cheio. O piso
    fica ENTRE os dois: o cheio passa dele, o da faixa não. Antes do conserto
    de 23/09, a lista da gaveta e a calculadora da PDP diziam "Grátis" e o
    pé cobrava a econômica inteira.
  */
  const comDois = await carrinhoCom(2)
  const { cart: deDois } = await (
    await fetch(`${MEDUSA}/store/carts/${comDois.id}?fields=id,item_total`, { headers: daLoja })
  ).json()
  const naFaixa = Number(deDois?.item_total ?? 0)
  const cheio = Math.round(Number(variante.calculated_price?.calculated_amount ?? 0) * 200) / 100
  confere(
    "2 unidades no carrinho saem pelo preço da faixa de quantidade",
    naFaixa > 0 && naFaixa < cheio,
    `carrinho ${naFaixa}, cheio ${cheio} — rode npm run backend:quantidade`
  )
  if (naFaixa > 0 && naFaixa < cheio) {
    const piso = Math.round((naFaixa + cheio) * 50) / 100
    await gravarConfig({
      frete: { modo: "gratis", piso, alvo: "mais-barata", tetoDeCusto: null },
      cotacao: { precoDeEmergencia: null },
    })
    const { opcoes: doMedusa } = await fretesDo(comDois)
    const cobrado = (doMedusa ?? []).find((o) => o.name === "Entrega econômica")?.amount
    const pelaSacola = (
      await calcular({
        cep: "90010150",
        itens: [{ variante_id: variante.id, quantidade: 2 }],
        cart_id: comDois.id,
      })
    ).corpo?.frete
    confere(
      "pela sacola, a rota cobra a econômica que o Medusa cobra, com o piso entre a faixa e o cheio",
      cobrado === MAIS_BARATA && pelaSacola?.opcoes?.[0]?.preco === cobrado,
      `Medusa ${cobrado}, rota ${pelaSacola?.opcoes?.[0]?.preco} (piso ${piso}, carrinho ${naFaixa})`
    )
    confere(
      "e o quanto falta pro frete grátis sai do valor do carrinho",
      Math.abs(Number(pelaSacola?.faltaPraGratis) - (piso - naFaixa)) < 0.005,
      `${pelaSacola?.faltaPraGratis} — o carrinho está a ${(piso - naFaixa).toFixed(2)} do piso`
    )

    /*
      A PDP, SEM CARRINHO, FAZ A CONTA DO CARRINHO QUE AINDA NÃO EXISTE: o
      preço na quantidade da linha, e a mesma variante numa linha só (o
      Medusa soma a quantidade quando ela entra de novo). É a PDP prometendo
      "Grátis" por um valor que o checkout não cobra que isto trava.
    */
    const pelaPdp = (
      await calcular({ cep: "90010150", itens: [{ variante_id: variante.id, quantidade: 2 }] })
    ).corpo?.frete
    const declarado = Number(falsa.ultimoCorpo?.ShipmentInvoiceValue)
    confere(
      "a PDP, sem carrinho, declara e cobra pelo preço da faixa, como o carrinho",
      declarado === naFaixa &&
        pelaPdp?.opcoes?.[0]?.preco === cobrado &&
        Math.abs(Number(pelaPdp?.faltaPraGratis) - (piso - naFaixa)) < 0.005,
      `declarou ${declarado} (carrinho ${naFaixa}); econômica ${pelaPdp?.opcoes?.[0]?.preco}, ` +
        `falta ${pelaPdp?.faltaPraGratis}`
    )
    const emDuasVezes = (
      await calcular({
        cep: "90010150",
        itens: [
          { variante_id: variante.id, quantidade: 1 },
          { variante_id: variante.id, quantidade: 1 },
        ],
      })
    ).corpo?.frete
    confere(
      "e a mesma variante mandada duas vezes vale como uma linha de 2",
      Number(falsa.ultimoCorpo?.ShipmentInvoiceValue) === naFaixa &&
        falsa.ultimoCorpo?.ShippingItemArray?.length === 1 &&
        emDuasVezes?.opcoes?.[0]?.preco === cobrado,
      JSON.stringify(falsa.ultimoCorpo)
    )
  }

  /* ── 9. cotação vazia ──────────────────────────────────────────────── */
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
  falsa.roteiro = "normal"

  /* ── 9½. esvaziar a sacola com frete pendurado ─────────────────────── */
  /*
    O Medusa refaz o frete pendurado a cada mudança no carrinho — inclusive
    quando sai o último item. Uma cotação sem item lançava, e SEM preço de
    emergência a remoção inteira dava 500: a lixeira não funcionava. Com a
    sacola pendurando a entrega logo no primeiro CEP, é o caminho de todo
    mundo que calculou o frete e desistiu.
  */
  await gravarConfig({ frete: { modo: "nenhuma" }, cotacao: { precoDeEmergencia: null } })
  const paraEsvaziar = await carrinhoCom(1)
  const { shipping_options: opcoesDoVazio } = await (
    await fetch(`${MEDUSA}/store/shipping-options?cart_id=${paraEsvaziar.id}`, { headers: daLoja })
  ).json()
  const comMetodo = await (
    await fetch(`${MEDUSA}/store/carts/${paraEsvaziar.id}/shipping-methods`, {
      method: "POST",
      headers: daLoja,
      body: JSON.stringify({ option_id: opcoesDoVazio[0]?.id }),
    })
  ).json()
  const ultimaLinha = comMetodo.cart?.items?.[0]
  const tirou = await fetch(
    `${MEDUSA}/store/carts/${paraEsvaziar.id}/line-items/${ultimaLinha?.id}`,
    {
      method: "DELETE",
      headers: daLoja,
    }
  )
  const esvaziado = await (
    await fetch(`${MEDUSA}/store/carts/${paraEsvaziar.id}?fields=id,*items`, { headers: daLoja })
  ).json()
  confere(
    "tirar o último item de um carrinho com frete pendurado funciona, mesmo sem emergência",
    tirou.ok && (esvaziado.cart?.items ?? []).length === 0,
    `DELETE respondeu ${tirou.status}; itens: ${(esvaziado.cart?.items ?? []).length}`
  )

  /* ── 10. a sacola, no navegador ────────────────────────────────────── */
  /*
    O bloco "Frete e prazo" da gaveta, no desenho do protótipo. O que ele
    tem de diferente da calculadora da PDP é que a ESCOLHA TEM EFEITO: vira
    o frete do carrinho, muda o pé da gaveta e chega marcada no checkout.

    Por isso tudo aqui é conferido contra o que o MEDUSA diz do carrinho,
    e nunca contra uma conta deste arquivo: se a tela somasse frete com
    produto e o teste fizesse a mesma soma, os dois concordariam errados.

    Precisa da loja de pé (LOJA, padrão http://localhost:3000). Contra
    `next start` o build tem que ter sido feito com o .env.development.local
    exportado — senão a loja fala com o Medusa de produção.
  */
  async function sacolaNoNavegador() {
    /* `LOJA`, como nos outros conferidores que abrem navegador. */
    const LOJA = process.env.LOJA ?? "http://localhost:3000"
    /* O shampoo, o mesmo do conferir-checkout. A oferta do checkout do fim
       do teste muda com os pedidos da loja, e o teste dela lê o produto que
       a tela mostrar. */
    const HANDLE = "shampoo-para-barba"
    const CEP_DA_SACOLA = "90010-150"

    const noAr = await fetch(`${LOJA}/produtos/${HANDLE}`)
      .then((r) => r.ok)
      .catch(() => false)
    confere(
      `a loja responde em ${LOJA} — a sacola se confere no navegador`,
      noAr,
      "suba a loja (npm run loja:dev) ou aponte LOJA pra ela"
    )
    if (!noAr) return

    const numero = (txt) =>
      Number(
        String(txt)
          .replace(/[^\d,]/g, "")
          .replace(",", ".")
      )

    /** Espera o Medusa concordar, em vez de um `waitForTimeout` no chute. */
    async function ate(condicao, segundos = 20) {
      for (let i = 0; i < segundos * 4; i++) {
        if (await condicao()) return true
        await new Promise((r) => setTimeout(r, 250))
      }
      return false
    }

    /*
      O PISO SAI DO PREÇO, pra que UMA unidade fique abaixo e DUAS acima.
      Número fixo aqui quebraria no dia em que o shampoo mudasse de preço —
      acusando a tela de um erro que é do teste.
    */
    const { products: achados } = await (
      await fetch(
        `${MEDUSA}/store/products?handle=${HANDLE}&region_id=${regiao.id}` +
          `&fields=id,*variants.calculated_price`,
        { headers: daLoja }
      )
    ).json()
    const preco = Number(achados?.[0]?.variants?.[0]?.calculated_price?.calculated_amount ?? 0)
    if (!preco) {
      confere(`o produto ${HANDLE} existe e tem preço`, false, "rode npm run backend:produtos")
      return
    }
    const piso = Math.round(preco * 150) / 100
    await gravarConfig({
      frete: { modo: "gratis", piso, alvo: "mais-barata", tetoDeCusto: null },
      cotacao: { precoDeEmergencia: null },
    })

    const { chromium } = await import("playwright")
    const navegador = await chromium.launch(
      process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
    )

    /** Uma aba nova, sem cookie nem CEP guardado, com o produto na sacola. */
    async function sacolaCheia() {
      const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
      const pagina = await contexto.newPage()
      const erros = []
      pagina.on("pageerror", (e) => erros.push(String(e)))

      await pagina.goto(`${LOJA}/produtos/${HANDLE}`, { waitUntil: "networkidle" })
      /* O `click` do Playwright acha o botão de novo se a hidratação trocar
         o elemento no meio — rolar e esperar à mão, antes, falhava com
         "not attached to the DOM" justamente nessa troca. */
      const comprar = pagina.locator(".compra__comprar").first()

      /* Duas tentativas: clique que chega enquanto a ilha de compra ainda
         hidrata não dispara nada. Quem testa o botão é o conferidor da
         PDP; aqui ele é só o caminho até a gaveta. */
      let carrinhoId = null
      for (let tentativa = 0; tentativa < 2 && !carrinhoId; tentativa++) {
        await comprar.click({ timeout: 20000 })
        await ate(async () => {
          const id = (await contexto.cookies()).find((c) => c.name === "carrinho")?.value
          if (!id) return false
          const r = await fetch(`${MEDUSA}/store/carts/${id}?fields=id,*items`, { headers: daLoja })
          const itens = r.ok ? (await r.json()).cart?.items : null
          if (itens?.length) carrinhoId = id
          return Boolean(carrinhoId)
        }, 15)
      }
      return { contexto, pagina, erros, carrinhoId }
    }

    try {
      const { contexto, pagina, erros, carrinhoId } = await sacolaCheia()
      confere("o produto entrou na sacola pela PDP", Boolean(carrinhoId))
      if (!carrinhoId) return

      const noMedusa = async () =>
        (
          await (
            await fetch(
              `${MEDUSA}/store/carts/${carrinhoId}?fields=id,item_total,shipping_total,total,` +
                "*items,*shipping_methods,*shipping_address",
              { headers: daLoja }
            )
          ).json()
        ).cart
      const { shipping_options: daLista } = await (
        await fetch(`${MEDUSA}/store/shipping-options?cart_id=${carrinhoId}`, { headers: daLoja })
      ).json()
      const idDa = (faixa) => daLista.find((o) => o.data?.faixa === faixa)?.id
      const pendurado = async () => (await noMedusa())?.shipping_methods?.[0]?.shipping_option_id

      const gaveta = pagina.locator(".sacolinha")
      const bloco = gaveta.locator(".sacolinha__entrega")
      const campo = bloco.locator("#carrinho-cep")
      const botao = bloco.locator(".sacolinha__cep-botao")
      const marcado = () => bloco.locator('input[name="entrega"]:checked').getAttribute("value")
      const pe = async () => ({
        subtotal: numero(await gaveta.locator(".sacolinha__detalhe b").nth(0).innerText()),
        frete: await gaveta.locator(".sacolinha__detalhe b").nth(1).innerText(),
        total: numero(await gaveta.locator(".sacolinha__soma-valor").innerText()),
        rotulo: await gaveta.locator(".sacolinha__soma-rotulo").innerText(),
      })

      await campo.waitFor({ state: "visible", timeout: 15000 })
      confere(
        "a gaveta tem o bloco do protótipo: título, campo colado no botão Calcular",
        /frete e prazo/i.test(await bloco.locator(".sacolinha__entrega-titulo").innerText()) &&
          /^calcular$/i.test((await botao.innerText()).trim())
      )
      confere(
        "e a calculadora da PDP não mora mais dentro dela",
        (await gaveta.locator(".cep__campo").count()) === 0
      )
      confere(
        "sem frete escolhido, o pé diz Subtotal e esconde a linha do frete",
        /subtotal/i.test(await gaveta.locator(".sacolinha__soma-rotulo").innerText()) &&
          (await gaveta.locator(".sacolinha__detalhe").isHidden())
      )

      /* CEP torto: a tela recusa, e o carrinho não é tocado. */
      await campo.fill("9001")
      await botao.click()
      await bloco.locator(".sacolinha__cep-erro:not([hidden])").waitFor({ timeout: 5000 })
      confere(
        "CEP curto é recusado na tela, com a frase do protótipo",
        (await bloco.locator(".sacolinha__cep-erro").innerText()).includes("8 números")
      )
      confere("e nada foi gravado no carrinho", !(await noMedusa())?.shipping_address?.postal_code)

      /* O cálculo: grava o CEP, cota e pendura a primeira. */
      falsa.chamadas = 0
      await campo.fill(CEP_DA_SACOLA)
      await botao.click()
      await bloco.locator(".sacolinha__opcao").first().waitFor({ timeout: 20000 })
      await ate(async () => (await pendurado()) === idDa("economica"))
      const viagensNoCalculo = falsa.chamadas
      let c = await noMedusa()
      confere(
        "calcular grava o CEP no carrinho",
        c?.shipping_address?.postal_code === "90010150",
        String(c?.shipping_address?.postal_code)
      )
      confere(
        "e pendura a econômica no carrinho",
        c?.shipping_methods?.[0]?.shipping_option_id === idDa("economica"),
        JSON.stringify(c?.shipping_methods?.map((m) => m.name))
      )
      /*
        A rota cota pra mostrar prazo e preço cheio; o Medusa cota de novo pra
        saber o preço da entrega pendurada. A pergunta é a mesma, e o `cotar`
        do backend junta as duas numa viagem. Sem isso, cada CEP digitado na
        sacola custaria duas cotações da conta da Frenet.
      */
      confere(
        "calcular na sacola custa UMA ida à Frenet — a rota e o carrinho dividem a cotação",
        viagensNoCalculo === 1,
        `foram ${viagensNoCalculo}`
      )
      confere(
        "o rádio marcado na tela é o frete gravado — marcado e gravado são a mesma coisa",
        (await marcado()) === c?.shipping_methods?.[0]?.shipping_option_id
      )

      const itensDoCarrinho = (carrinho) =>
        (carrinho?.items ?? []).map((i) => ({ variante_id: i.variant_id, quantidade: i.quantity }))
      const cotadas = (await calcular({ cep: "90010150", itens: itensDoCarrinho(c) })).corpo?.frete
        ?.opcoes
      const naTela = await bloco.locator(".sacolinha__opcao").evaluateAll((linhas) =>
        linhas.map((l) => ({
          nome: l.querySelector(".sacolinha__opcao-nome")?.textContent?.trim() ?? "",
          prazo: l.querySelector(".sacolinha__opcao-prazo")?.textContent?.trim() ?? "",
          preco: l.querySelector(".sacolinha__opcao-preco")?.textContent?.trim() ?? "",
        }))
      )
      confere(
        "as entregas da tela são as da cotação, na mesma ordem",
        naTela.length === cotadas?.length && naTela.every((t, i) => t.nome === cotadas[i].nome),
        `${JSON.stringify(naTela.map((t) => t.nome))} × ${JSON.stringify(cotadas?.map((o) => o.nome))}`
      )
      confere(
        "com o prazo que a transportadora deu",
        naTela.every((t, i) => t.prazo === `Chega em ${cotadas[i].prazo}`),
        JSON.stringify(naTela.map((t) => t.prazo))
      )
      confere(
        "e o preço que o Medusa cobraria por cada uma",
        naTela.every((t, i) => numero(t.preco) === cotadas[i].preco),
        JSON.stringify(naTela.map((t) => t.preco))
      )

      let p = await pe()
      confere(
        "o pé mostra o frete que o Medusa cobra",
        numero(p.frete) === Number(c.shipping_total),
        `${p.frete} × ${c.shipping_total}`
      )
      confere(
        "o subtotal do pé é o dos produtos, e o total é o dele — com o rótulo Total",
        p.subtotal === Number(c.item_total) &&
          p.total === Number(c.total) &&
          /total/i.test(p.rotulo),
        JSON.stringify(p)
      )

      /* Trocar de entrega troca no carrinho. */
      await bloco.locator(".sacolinha__opcao").nth(1).click()
      const trocou = await ate(async () => (await pendurado()) === idDa("expressa"))
      await pagina
        .locator(".sacolinha[data-ocupada]")
        .waitFor({ state: "detached", timeout: 10000 })
      c = await noMedusa()
      p = await pe()
      confere("escolher a expressa troca o frete NO CARRINHO", trocou)
      confere(
        "e o pé acompanha o Medusa",
        numero(p.frete) === Number(c.shipping_total) && p.total === Number(c.total),
        `${JSON.stringify(p)} × ${c.shipping_total}/${c.total}`
      )

      /* Mais uma unidade: o piso é batido e a lista se refaz sozinha. */
      falsa.chamadas = 0
      await gaveta.locator(".sacolinha__passo[aria-label^='Aumentar']").first().click()
      await ate(async () => (await noMedusa())?.items?.[0]?.quantity === 2)
      const refez = await bloco
        .locator(".sacolinha__opcao-preco[data-gratis]")
        .first()
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false)
      const viagensNaQuantidade = falsa.chamadas
      c = await noMedusa()
      const cotadas2 = (await calcular({ cep: "90010150", itens: itensDoCarrinho(c) })).corpo?.frete
        ?.opcoes
      confere(
        "com o piso batido, a lista se refaz sozinha e a econômica vira Grátis",
        refez && cotadas2?.[0]?.preco === 0,
        JSON.stringify(cotadas2?.map((o) => [o.nome, o.preco]))
      )
      confere(
        "e isso custou uma ida à Frenet: o Medusa refez o frete pendurado, a lista aproveitou",
        viagensNaQuantidade === 1,
        `foram ${viagensNaQuantidade}`
      )
      confere(
        "riscando o preço cheio que a rota mandou",
        numero(await bloco.locator(".sacolinha__opcao").first().locator("s").innerText()) ===
          cotadas2?.[0]?.precoCheio
      )
      confere(
        "e a expressa continua pendurada — mudar a quantidade não muda a escolha",
        c?.shipping_methods?.[0]?.shipping_option_id === idDa("expressa")
      )
      p = await pe()
      confere(
        "o pé mostra o frete da expressa que o Medusa recalculou",
        numero(p.frete) === Number(c.shipping_total) && p.total === Number(c.total),
        `${JSON.stringify(p)} × ${c.shipping_total}/${c.total}`
      )

      /* Alterar e recalcular o MESMO CEP não desfaz a escolha. */
      await bloco.locator(".sacolinha__cep-ok button").click()
      await campo.waitFor({ state: "visible", timeout: 5000 })
      confere(
        "alterar devolve o campo com o CEP de antes, e o cursor nele",
        (await campo.inputValue()) === CEP_DA_SACOLA &&
          (await campo.evaluate((el) => el === document.activeElement))
      )
      await botao.click()
      await bloco.locator(".sacolinha__opcao").first().waitFor({ timeout: 20000 })
      await pagina
        .locator(".sacolinha[data-ocupada]")
        .waitFor({ state: "detached", timeout: 10000 })
      confere(
        "recalcular o mesmo CEP mantém a expressa que a pessoa escolheu",
        (await pendurado()) === idDa("expressa") && (await marcado()) === idDa("expressa")
      )

      /* A econômica, agora grátis. */
      await bloco.locator(".sacolinha__opcao").first().click()
      await ate(async () => (await pendurado()) === idDa("economica"))
      await gaveta
        .locator(".sacolinha__detalhe b[data-gratis]")
        .waitFor({ timeout: 10000 })
        .catch(() => {})
      c = await noMedusa()
      p = await pe()
      confere(
        "escolher a econômica zera o frete no Medusa, e o pé diz Grátis",
        Number(c.shipping_total) === 0 && /gr[áa]tis/i.test(p.frete) && p.total === Number(c.total),
        `${JSON.stringify(p)} × ${c.shipping_total}/${c.total}`
      )

      /* Recarregar: o que ficou no carrinho volta pra tela sozinho. */
      await pagina.reload({ waitUntil: "domcontentloaded" })
      await pagina.locator("button[aria-controls='carrinho-gaveta']").click()
      const voltou = await bloco
        .locator(".sacolinha__cep-ok b")
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false)
      confere(
        "a gaveta reaberta mostra o CEP e a entrega que ficaram no carrinho",
        voltou &&
          (await bloco.locator(".sacolinha__cep-ok b").innerText()) === CEP_DA_SACOLA &&
          (await marcado()) === idDa("economica")
      )

      /* O checkout herda o que a sacola escolheu. */
      await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
      await pagina.locator("#form-entrega").waitFor({ state: "attached", timeout: 20000 })
      confere(
        "o checkout abre com o CEP da sacola",
        (await pagina.locator('#form-entrega [name="cep"]').inputValue()) === CEP_DA_SACOLA
      )
      confere(
        "e com a entrega escolhida na sacola já marcada",
        (await pagina
          .locator('#form-entrega input[name="opcao"]:checked')
          .getAttribute("value")
          .catch(() => null)) === idDa("economica")
      )
      confere("nenhum erro de JavaScript na página", erros.length === 0, erros[0])
      await contexto.close()

      /* A queda, sem e com socorro. */
      falsa.roteiro = "queda"
      const semSocorro = await sacolaCheia()
      const blocoSem = semSocorro.pagina.locator(".sacolinha__entrega")
      await blocoSem.locator("#carrinho-cep").fill(CEP_DA_SACOLA)
      await blocoSem.locator(".sacolinha__cep-botao").click()
      await blocoSem.locator(".sacolinha__cep-erro:not([hidden])").waitFor({ timeout: 25000 })
      const semMetodo = await (
        await fetch(`${MEDUSA}/store/carts/${semSocorro.carrinhoId}?fields=id,*shipping_methods`, {
          headers: daLoja,
        })
      ).json()
      confere(
        "com a Frenet fora e sem emergência, a sacola diz que não conseguiu",
        /não consegui calcular/i.test(await blocoSem.locator(".sacolinha__cep-erro").innerText()) &&
          (await blocoSem.locator(".sacolinha__opcao").count()) === 0
      )
      confere(
        "e não pendura frete nenhum no carrinho",
        !(semMetodo.cart?.shipping_methods ?? []).length
      )
      await semSocorro.contexto.close()

      await gravarConfig({
        frete: { modo: "nenhuma" },
        cotacao: { precoDeEmergencia: 19.9, prazoDeEmergencia: "7 dias úteis" },
      })
      const comSocorro = await sacolaCheia()
      const blocoCom = comSocorro.pagina.locator(".sacolinha__entrega")
      await blocoCom.locator("#carrinho-cep").fill(CEP_DA_SACOLA)
      await blocoCom.locator(".sacolinha__cep-botao").click()
      const apareceu = await blocoCom
        .locator(".sacolinha__opcao")
        .first()
        .waitFor({ timeout: 25000 })
        .then(() => true)
        .catch(() => false)
      confere(
        "com emergência, a sacola mostra o preço dela e diz que é estimativa",
        apareceu &&
          numero(await blocoCom.locator(".sacolinha__opcao-preco").first().innerText()) === 19.9 &&
          (await blocoCom.locator(".sacolinha__cep-aviso").isVisible())
      )
      await comSocorro.contexto.close()
      falsa.roteiro = "normal"
    } catch (e) {
      /* Um seletor que não apareceu vira FALHA com o motivo, e não uma
         exceção que derruba o relatório inteiro antes do placar. */
      confere("a sacola no navegador rodou até o fim", false, e.message.split("\n")[0])
    } finally {
      falsa.roteiro = "normal"
      await navegador.close()
    }
  }

  await sacolaNoNavegador()
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
