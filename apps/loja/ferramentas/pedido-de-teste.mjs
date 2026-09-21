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

  /** Lê o pedido pelo admin — o estado de verdade, com envios e pagamentos. */
  const noAdmin = async (id) =>
    (
      await adm(
        `/admin/orders/${id}?fields=id,display_id,status,payment_status,fulfillment_status,total,` +
          "*items,*fulfillments"
      )
    ).order

  /**
   * Um pedido com o Pix esperando. `itens` é uma lista de handles com
   * quantidade: [["shampoo-para-barba", 2], ["balm-para-barba", 1]].
   */
  async function pedidoPix(email, itens = [["shampoo-para-barba", 1]]) {
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
      body: JSON.stringify({ email, shipping_address: ENDERECO, billing_address: ENDERECO }),
    })
    const { shipping_options } = await loja(`/store/shipping-options?cart_id=${cart.id}`)
    await loja(`/store/carts/${cart.id}/shipping-methods`, {
      method: "POST",
      body: JSON.stringify({ option_id: shipping_options[0].id }),
    })
    const { payment_collection } = await loja("/store/payment-collections", {
      method: "POST",
      body: JSON.stringify({ cart_id: cart.id }),
    })
    const antes = new Set(pagarme.pedidos.keys())
    await loja(`/store/payment-collections/${payment_collection.id}/payment-sessions`, {
      method: "POST",
      body: JSON.stringify({ provider_id: PAGARME, data: { entrada: entradaDoPix(email) } }),
    })
    const fim = await loja(`/store/carts/${cart.id}/complete`, { method: "POST" })
    if (fim?.type !== "order")
      throw new Error(`o carrinho não virou pedido: ${JSON.stringify(fim)}`)
    const noPagarme = [...pagarme.pedidos.keys()].find((k) => !antes.has(k)) ?? null
    return { id: fim.order.id, numero: fim.order.display_id, noPagarme }
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

  /** Separado e postado, com a etiqueta do rastreio. */
  async function enviar(pedido, { codigo, url = null }) {
    const o = await noAdmin(pedido.id)
    const itens = o.items.map((i) => ({ id: i.id, quantity: i.quantity }))
    await adm(`/admin/orders/${pedido.id}/fulfillments`, {
      method: "POST",
      body: JSON.stringify({ items: itens }),
    })
    const separado = await noAdmin(pedido.id)
    const envio = separado.fulfillments.find((f) => !f.canceled_at && !f.shipped_at)
    await adm(`/admin/orders/${pedido.id}/fulfillments/${envio.id}/shipments`, {
      method: "POST",
      body: JSON.stringify({
        items: itens,
        labels: [{ tracking_number: codigo, tracking_url: url ?? "#", label_url: "#" }],
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

  return { pedidoPix, pagar, enviar, entregar, cancelar, noAdmin }
}
