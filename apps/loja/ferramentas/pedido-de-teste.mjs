/**
 * PEDIDOS DE TESTE — um pedido de verdade no Medusa local, em qualquer ponto
 * da vida dele: Pix esperando, pago, enviado com rastreio, entregue ou
 * cancelado. É o que o conferidor da conta precisa pra desenhar cada estado
 * sem depender do que sobrou no banco de rodadas anteriores.
 *
 * O PEDIDO NASCE COMO NA LOJA: carrinho, endereço, frete (a Frenet falsa
 * cota), sessão do Pix no provedor do Pagar.me (o falso responde) e
 * `complete`. O que acontece DEPOIS é o que acontece no admin: o Pix cai (o
 * falso paga e manda o webhook), o pedido é separado, postado com o código
 * de rastreio, entregue — ou cancelado.
 *
 * Precisa do Medusa apontando pros falsos (ver AGENTS.md) e de um token de
 * admin. Cada pedido enviado ou entregue tira uma unidade de estoque de
 * verdade do banco local (o shampoo tem 400).
 */

const PAGARME = "pp_pagarme_pagarme"

const ENDERECO = {
  first_name: "Rafael",
  last_name: "Teste",
  phone: "+5511988887777",
  address_1: "Rua Doutor Pedro Zimmermann, 99",
  address_2: "Casa 2 — Itoupava Central",
  city: "Blumenau",
  province: "SC",
  postal_code: "89036370",
  country_code: "br",
  metadata: {
    rua: "Rua Doutor Pedro Zimmermann",
    numero: "99",
    complemento: "Casa 2",
    bairro: "Itoupava Central",
  },
}

/** A `entrada` que a ação de finalizar da loja mandaria pra um Pix. */
const entradaDoPix = (email) => ({
  forma: "pix",
  parcelas: 1,
  token: null,
  comprador: {
    nome: "Rafael Teste",
    email,
    documento: "11144477735",
    tipoDocumento: "cpf",
    telefone: "+5511988887777",
  },
  endereco: {
    rua: "Rua Doutor Pedro Zimmermann",
    numero: "99",
    complemento: "Casa 2",
    bairro: "Itoupava Central",
    cidade: "Blumenau",
    uf: "SC",
    cep: "89036370",
  },
  itens: [{ codigo: "x", descricao: "x", quantidade: 1, total: 1 }],
  frete: { total: 0, descricao: "" },
  ip: null,
})

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {{ medusa: string, chave: string, tokenAdmin: string, pagarme: any }} o
 */
export function fabricaDePedidos({ medusa, chave, tokenAdmin, pagarme }) {
  const cabLoja = { "content-type": "application/json", "x-publishable-api-key": chave }
  const cabAdmin = { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` }

  async function loja(caminho, opcoes = {}) {
    const r = await fetch(`${medusa}${caminho}`, { headers: cabLoja, ...opcoes })
    const json = await r.json().catch(() => null)
    if (!r.ok)
      throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${JSON.stringify(json)}`)
    return json
  }
  async function adm(caminho, opcoes = {}) {
    const r = await fetch(`${medusa}${caminho}`, { headers: cabAdmin, ...opcoes })
    const json = await r.json().catch(() => null)
    if (!r.ok)
      throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${JSON.stringify(json)}`)
    return json
  }

  let regiao = null
  const variantes = new Map()
  async function variante(handle) {
    if (!regiao) {
      const { regions } = await loja("/store/regions")
      regiao = regions.find((x) => x.currency_code === "brl")
    }
    if (!variantes.has(handle)) {
      const { products } = await loja(
        `/store/products?handle=${handle}&region_id=${regiao.id}&fields=*variants`
      )
      variantes.set(handle, products[0].variants[0].id)
    }
    return variantes.get(handle)
  }

  /** Lê o pedido pelo admin — o estado de verdade, com envios (e etiquetas) e pagamentos. */
  const noAdmin = async (id) =>
    (
      await adm(
        `/admin/orders/${id}?fields=id,display_id,status,payment_status,fulfillment_status,total,metadata,` +
          "*items,*fulfillments,*fulfillments.labels"
      )
    ).order

  /**
   * O carrinho pronto pra pagar: os itens, o e-mail, o endereço (com o CPF
   * no de cobrança, se vier) e o frete mais barato. `itens` é uma lista de
   * handles com quantidade: [["shampoo-para-barba", 2], ["balm-para-barba", 1]].
   *
   * `documento` põe o CPF no endereço de cobrança, como o checkout da loja
   * grava (`montarEndereco`) — é de lá que a nota fiscal tira o CPF.
   */
  async function carrinhoPronto(email, itens, documento, cupom = null) {
    await variante(itens[0][0]) // a região vem junto
    const { cart } = await loja("/store/carts", {
      method: "POST",
      body: JSON.stringify({ region_id: regiao.id }),
    })
    for (const [handle, quantidade] of itens) {
      await loja(`/store/carts/${cart.id}/line-items`, {
        method: "POST",
        body: JSON.stringify({ variant_id: await variante(handle), quantity: quantidade }),
      })
    }
    await loja(`/store/carts/${cart.id}`, {
      method: "POST",
      body: JSON.stringify({
        email,
        shipping_address: ENDERECO,
        billing_address: documento
          ? {
              ...ENDERECO,
              metadata: { ...ENDERECO.metadata, documento: { tipo: "cpf", valor: documento } },
            }
          : ENDERECO,
      }),
    })
    const { shipping_options } = await loja(`/store/shipping-options?cart_id=${cart.id}`)
    await loja(`/store/carts/${cart.id}/shipping-methods`, {
      method: "POST",
      body: JSON.stringify({ option_id: shipping_options[0].id }),
    })
    // O cupom antes da cobrança: o valor do Pix já sai com o desconto, como na loja.
    if (cupom)
      await loja(`/store/carts/${cart.id}/promotions`, {
        method: "POST",
        body: JSON.stringify({ promo_codes: [cupom] }),
      })
    const { payment_collection } = await loja("/store/payment-collections", {
      method: "POST",
      body: JSON.stringify({ cart_id: cart.id }),
    })
    return { cart, colecao: payment_collection }
  }

  /** A sessão do Pagar.me com esta `entrada`, e o `complete` — o que a loja faz no "Finalizar". */
  async function fechar(cart, colecao, entrada) {
    const antes = new Set(pagarme.pedidos.keys())
    await loja(`/store/payment-collections/${colecao.id}/payment-sessions`, {
      method: "POST",
      body: JSON.stringify({ provider_id: PAGARME, data: { entrada } }),
    })
    const fim = await loja(`/store/carts/${cart.id}/complete`, { method: "POST" })
    if (fim?.type !== "order")
      throw new Error(`o carrinho não virou pedido: ${JSON.stringify(fim)}`)
    const noPagarme = [...pagarme.pedidos.keys()].find((k) => !antes.has(k)) ?? null
    return { id: fim.order.id, numero: fim.order.display_id, noPagarme }
  }

  /**
   * Um pedido com o Pix esperando.
   *
   * `cupom` põe um código no carrinho antes da cobrança, como a loja faz
   * (o conferidor dos cupons do painel) — ou o da oferta do checkout, do
   * `codigoDaOferta` (os de pedidos e de clientes).
   *
   * `validadeSegundos` manda no `expires_at` que o Pagar.me falso devolve.
   * NEGATIVO faz um Pix que já nasce vencido — é assim que o conferidor da
   * conta desenha a tela do "Pix vencido" sem esperar meia hora. Ele ainda
   * tem os 10 minutos de folga da conciliação antes de virar cancelado, que
   * é tempo de sobra pro teste. A validade fica valendo até o `complete`:
   * é nele (no `authorizePayment`) que o pedido nasce no Pagar.me, e não na
   * sessão.
   */
  async function pedidoPix(
    email,
    itens = [["shampoo-para-barba", 1]],
    { validadeSegundos = null, documento = null, cupom = null } = {}
  ) {
    const { cart, colecao } = await carrinhoPronto(email, itens, documento, cupom)
    pagarme.validadeDoPix = validadeSegundos
    try {
      return await fechar(cart, colecao, entradaDoPix(email))
    } finally {
      pagarme.validadeDoPix = null
    }
  }

  /**
   * Um pedido no cartão, como a loja faz: o número vira token no Pagar.me
   * (o falso, com a chave PÚBLICA na query, como o navegador), e a sessão
   * vai com o token. O `cartao` escolhe o fim, pelas regras do falso:
   * "4000000000000036" nasce em análise (o teste decide depois, com
   * `pagarme.aprovarAnalise` ou `reprovarAnalise`), "4000000000000010" é
   * aprovado e "4000000000000028", recusado.
   */
  async function pedidoCartao(
    email,
    itens = [["shampoo-para-barba", 1]],
    { cartao = "4000000000000036", parcelas = 2, documento = "11144477735" } = {}
  ) {
    const { cart, colecao } = await carrinhoPronto(email, itens, documento)
    const r = await fetch(`http://127.0.0.1:${pagarme.porta}/core/v5/tokens?appId=pk_test_falsa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "card",
        card: {
          number: cartao,
          holder_name: "RAFAEL TESTE",
          exp_month: 12,
          exp_year: 2030,
          cvv: "123",
        },
      }),
    })
    const token = (await r.json())?.id
    if (!token) throw new Error(`o Pagar.me falso não tokenizou o cartão (${r.status})`)
    return fechar(cart, colecao, { ...entradaDoPix(email), forma: "cartao", parcelas, token })
  }

  /** O Pix cai: o falso paga e avisa o Medusa pelo webhook. Espera o Medusa registrar. */
  async function pagar(pedido) {
    await pagarme.pagar(pedido.noPagarme)
    for (let i = 0; i < 30; i++) {
      const o = await noAdmin(pedido.id)
      if (o.payment_status === "captured") return o
      await esperar(500)
    }
    throw new Error(`o pagamento do pedido #${pedido.numero} não chegou no Medusa`)
  }

  /**
   * Só separado — o "Fulfill items" do admin, na hora de embalar —, sem
   * postar. Devolve o id do envio (o fulfillment).
   */
  async function separar(pedido) {
    const o = await noAdmin(pedido.id)
    await adm(`/admin/orders/${pedido.id}/fulfillments`, {
      method: "POST",
      body: JSON.stringify({ items: o.items.map((i) => ({ id: i.id, quantity: i.quantity })) }),
    })
    const separado = await noAdmin(pedido.id)
    return separado.fulfillments.find((f) => !f.canceled_at && !f.shipped_at).id
  }

  /**
   * Separado e postado, com a etiqueta do rastreio. `avisar: false` é o
   * "não avisar o cliente" do admin (o `no_notification` do Medusa).
   */
  async function enviar(pedido, { codigo, url = null, avisar = true }) {
    const o = await noAdmin(pedido.id)
    const itens = o.items.map((i) => ({ id: i.id, quantity: i.quantity }))
    const envio = { id: await separar(pedido) }
    await adm(`/admin/orders/${pedido.id}/fulfillments/${envio.id}/shipments`, {
      method: "POST",
      body: JSON.stringify({
        items: itens,
        labels: [{ tracking_number: codigo, tracking_url: url ?? "#", label_url: "#" }],
        ...(avisar ? {} : { no_notification: true }),
      }),
    })
    return envio.id
  }

  async function entregar(pedido, envioId) {
    await adm(`/admin/orders/${pedido.id}/fulfillments/${envioId}/mark-as-delivered`, {
      method: "POST",
    })
  }

  async function cancelar(pedido) {
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
  }

  /**
   * O código da oferta do checkout de um produto: a promoção `BUMP-<HANDLE>-…`
   * que o job `bumps` mantém (10% numa unidade). Vai no `cupom` do
   * `pedidoPix`, e o pedido nasce com desconto — o `total` do Medusa abaixo
   * do `original_total`, como o de quem marca a oferta na loja.
   */
  async function codigoDaOferta(handle) {
    const prefixo = `BUMP-${handle.toUpperCase()}-`
    const { promotions } = await adm(`/admin/promotions?q=${prefixo}&fields=code,status&limit=50`)
    const codigo = promotions.find(
      (p) => p.status === "active" && p.code?.startsWith(prefixo)
    )?.code
    if (!codigo)
      throw new Error(`sem a oferta do checkout do ${handle} no banco (o job "bumps" cria)`)
    return codigo
  }

  /**
   * O que o Pagar.me cobrou (o Pix, o cartão), em reais: o `valor` em
   * centavos que o provedor gravou na sessão — com os descontos, antes de
   * estorno. Não é o `amount` da cobrança do Medusa: ele guarda fração de
   * centavo (a oferta dá 10% de R$ 52,45 = R$ 5,245, e o pedido fica em
   * R$ 123,355), e o Pagar.me cobra R$ 123,36.
   */
  async function cobrado(pedido) {
    const { order } = await adm(
      `/admin/orders/${pedido.id}?fields=payment_collections.payment_sessions.data`
    )
    const sessoes = (order.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? [])
    const centavos = sessoes.map((s) => s.data?.pagarme?.valor).find((v) => Number.isFinite(v))
    if (centavos === undefined) throw new Error(`o pedido #${pedido.numero} não tem cobrança`)
    return centavos / 100
  }

  return {
    pedidoPix,
    pedidoCartao,
    pagar,
    separar,
    enviar,
    entregar,
    cancelar,
    noAdmin,
    codigoDaOferta,
    cobrado,
  }
}
