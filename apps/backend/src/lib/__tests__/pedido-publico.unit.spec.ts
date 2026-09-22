import { acessoAoPedido, paraPedidoPublico, respostaPublica } from "../pedido-publico"

const CARRINHO = "cart_01M33J4D4GR3X8DZ16DA0QYH4C"
const OUTRO_CARRINHO = "cart_01M33J07XPHG2K03GCCEA4VY7R"
const CLIENTE = "cus_01M30YN9Y86P6136QX2GEPA3WY"

const posse = { customer_id: CLIENTE, cart: { id: CARRINHO } }

describe("quem leva o pedido inteiro", () => {
  it("sem prova nenhuma: a versão pública", () => {
    expect(acessoAoPedido(posse, {})).toBe("publico")
    expect(acessoAoPedido(posse, { cliente: null })).toBe("publico")
  })

  it("o carrinho de onde o pedido nasceu: dono", () => {
    expect(acessoAoPedido(posse, { carrinho: CARRINHO })).toBe("dono")
  })

  it("carrinho errado, vazio ou de pedido sem carrinho: recusado, e não a versão pública", () => {
    expect(acessoAoPedido(posse, { carrinho: OUTRO_CARRINHO })).toBe("recusado")
    expect(acessoAoPedido(posse, { carrinho: "" })).toBe("recusado")
    expect(acessoAoPedido(posse, { carrinho: CARRINHO.slice(0, -1) })).toBe("recusado")
    expect(acessoAoPedido({ customer_id: CLIENTE, cart: null }, { carrinho: CARRINHO })).toBe(
      "recusado"
    )
  })

  it("a conta dona do pedido: dono, com ou sem carrinho", () => {
    expect(acessoAoPedido(posse, { cliente: CLIENTE })).toBe("dono")
    expect(acessoAoPedido(posse, { cliente: CLIENTE, carrinho: OUTRO_CARRINHO })).toBe("dono")
  })

  it("outra conta não é dona", () => {
    expect(acessoAoPedido(posse, { cliente: "cus_outra" })).toBe("publico")
    expect(acessoAoPedido(posse, { cliente: "cus_outra", carrinho: OUTRO_CARRINHO })).toBe(
      "recusado"
    )
    // Pedido sem cliente não casa com "cliente vazio".
    expect(acessoAoPedido({ customer_id: null, cart: { id: CARRINHO } }, { cliente: "" })).toBe(
      "publico"
    )
  })
})

/** Um pedido como o Medusa devolve, com tudo que não pode sair. */
const inteiro = {
  id: "order_01ABC",
  display_id: 384,
  status: "pending",
  created_at: "2026-09-22T03:21:55.753Z",
  payment_status: "awaiting",
  email: "rafael@exemplo.com",
  total: 123.5,
  customer_id: CLIENTE,
  customer: { id: CLIENTE, email: "rafael@exemplo.com" },
  cart: { id: CARRINHO },
  shipping_address: { first_name: "Rafael", address_1: "Rua Doutor Pedro Zimmermann, 99" },
  billing_address: { metadata: { documento: { tipo: "cpf", valor: "11144477735" } } },
  items: [{ title: "Shampoo", quantity: 2 }],
  payment_collections: [
    {
      id: "paycol_1",
      amount: 123.5,
      payment_sessions: [
        {
          id: "payses_1",
          provider_id: "pp_pagarme_pagarme",
          amount: 123.5,
          data: {
            pagarme: {
              forma: "pix",
              situacao: "aguardando",
              valor: 12350,
              pedido: "or_1",
              cobranca: "ch_1",
              pix: { copiaECola: "00020126…", imagem: "https://qr", expiraEm: "2026-09-22" },
              cartao: null,
            },
            entrada: null,
          },
        },
      ],
    },
  ],
}

describe("a versão pública", () => {
  it("só número, situação e a forma de pagamento", () => {
    expect(paraPedidoPublico(inteiro)).toEqual({
      id: "order_01ABC",
      display_id: 384,
      status: "pending",
      created_at: "2026-09-22T03:21:55.753Z",
      payment_status: "awaiting",
      payment_collections: [
        {
          payment_sessions: [
            { provider_id: "pp_pagarme_pagarme", data: { pagarme: { forma: "pix" } } },
          ],
        },
      ],
    })
  })

  it("nada de dado pessoal, do QR do Pix, do final do cartão ou do carrinho", () => {
    const cartao = {
      ...inteiro,
      payment_collections: [
        {
          payment_sessions: [
            {
              provider_id: "pp_pagarme_pagarme",
              data: { pagarme: { forma: "cartao", cartao: { bandeira: "Visa", final: "0010" } } },
            },
          ],
        },
      ],
    }
    for (const pedido of [inteiro, cartao]) {
      const texto = JSON.stringify(paraPedidoPublico(pedido))
      for (const segredo of [
        "rafael@",
        "11144477735",
        "Zimmermann",
        "Rafael",
        CARRINHO,
        CLIENTE,
        "00020126",
        "0010",
        "Visa",
        "or_1",
        "123.5",
      ]) {
        expect(texto).not.toContain(segredo)
      }
    }
  })

  it("sessão de outro provedor, ou sem estado, fica sem dado nenhum", () => {
    const provisorio = {
      id: "order_1",
      payment_collections: [
        { payment_sessions: [{ provider_id: "pp_system_default", data: { qualquer: "coisa" } }] },
        null,
      ],
    }
    expect(paraPedidoPublico(provisorio).payment_collections).toEqual([
      { payment_sessions: [{ provider_id: "pp_system_default", data: {} }] },
      { payment_sessions: [] },
    ])
    expect(paraPedidoPublico({ id: "order_2" }).payment_collections).toEqual([])
  })

  it("a resposta da rota: o pedido trocado, o erro como veio", () => {
    expect(respostaPublica({ order: inteiro })).toEqual({ order: paraPedidoPublico(inteiro) })
    const erro = { type: "not_found", message: "Order id not found: order_x" }
    expect(respostaPublica(erro)).toBe(erro)
    expect(respostaPublica(null)).toBeNull()
  })
})
