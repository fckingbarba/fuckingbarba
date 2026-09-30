import {
  pendentes,
  precoDoServico,
  taxaDoMercadoPago,
  taxaDoPagarme,
  temCotacao,
  TENTATIVAS,
  type Guardado,
  type PedidoDosCustos,
} from "../custos-dos-pedidos"

/**
 * O que o job `custos-dos-pedidos` busca fora: a taxa de cada parceiro (a
 * do Pagar.me pelos recebíveis, a do Mercado Pago pelo `fee_details`), quem
 * ainda precisa de taxa ou de frete, e o serviço certo numa cotação nova.
 */

const sessao = (provider: string, chave: string, cobranca: string | null, forma = "cartao") => ({
  provider_id: provider,
  status: "captured",
  data: { [chave]: { forma, situacao: "paga", valor: 0, cobranca } },
})

function pedido(
  o: Partial<PedidoDosCustos> & { id: string; cotado?: number | null; pago?: boolean }
) {
  return {
    status: "pending",
    shipping_address: { postal_code: "89036370" },
    items: [{ quantity: 1, unit_price: 54.9, variant: { weight: 120 } }],
    shipping_methods: [
      {
        name: "Econômica",
        data: o.cotado === null ? {} : { servico: { codigo: "04510", preco: o.cotado ?? 21.3 } },
      },
    ],
    payment_collections: [
      {
        payment_sessions: [sessao("pp_pagarme_pagarme", "pagarme", "ch_1")],
        payments: [{ captured_at: o.pago === false ? null : "2026-09-28T13:00:00Z" }],
      },
    ],
    ...o,
  } as PedidoDosCustos
}

describe("a taxa de cada parceiro", () => {
  it("Pagar.me: a soma das taxas dos recebíveis da venda (as parcelas), sem o estorno", () => {
    expect(
      taxaDoPagarme([
        { type: "credit", installment: 1, amount: 4390, fee: 206, anticipation_fee: 0 },
        { type: "credit", installment: 2, amount: 4390, fee: 206, fraud_coverage_fee: 12 },
        { type: "refund", amount: -8780, fee: 0 },
      ])
    ).toBe(424)
    expect(taxaDoPagarme([{ amount: 9990, fee: 99 }])).toBe(99)
  })

  it("Pagar.me: sem recebível da venda ainda, não dá pra saber", () => {
    expect(taxaDoPagarme([])).toBeNull()
    expect(taxaDoPagarme([{ type: "refund", amount: -100 }])).toBeNull()
  })

  it("Mercado Pago: o que ele cobrou da loja, só depois de aprovado", () => {
    expect(
      taxaDoMercadoPago({
        status: "approved",
        fee_details: [
          { type: "mercadopago_fee", amount: 0.69, fee_payer: "collector" },
          { type: "financing_fee", amount: 5, fee_payer: "payer" },
        ],
      })
    ).toBe(69)
    expect(taxaDoMercadoPago({ status: "approved", fee_details: [] })).toBe(0)
    expect(taxaDoMercadoPago({ status: "pending", fee_details: [] })).toBeNull()
  })
})

describe("quem ainda precisa", () => {
  const nada = new Map<string, Guardado>()

  it("o pago sem a taxa precisa dela, com o parceiro e a cobrança", () => {
    expect(pendentes([pedido({ id: "order_1" })], nada)).toEqual([
      {
        pedido: expect.objectContaining({ id: "order_1" }),
        taxa: { parceiro: "pagarme", cobranca: "ch_1" },
        frete: false,
      },
    ])
  })

  it("o que não foi pago, o que já tem tudo e o que esgotou as tentativas ficam de fora", () => {
    expect(pendentes([pedido({ id: "order_1", pago: false })], nada)).toEqual([])
    const comTaxa = new Map([["order_1", { taxa: 206, frete: null, tentativas: 1 }]])
    expect(pendentes([pedido({ id: "order_1" })], comTaxa)).toEqual([])
    const esgotou = new Map([["order_1", { taxa: null, frete: null, tentativas: TENTATIVAS }]])
    expect(pendentes([pedido({ id: "order_1", cotado: null })], esgotou)).toEqual([])
  })

  it("sem a cotação do checkout, precisa do frete — o cancelado não (não sai etiqueta)", () => {
    const semCotacao = pedido({ id: "order_2", cotado: null })
    expect(temCotacao(semCotacao)).toBe(false)
    expect(pendentes([semCotacao], nada)[0]).toMatchObject({ frete: true })
    const comFrete = new Map([["order_2", { taxa: 206, frete: 1850, tentativas: 1 }]])
    expect(pendentes([semCotacao], comFrete)).toEqual([])
    expect(
      pendentes([pedido({ id: "order_3", cotado: null, status: "canceled" })], nada)[0]
    ).toMatchObject({ frete: false })
  })

  it("o Pix do Pagar.me não lê taxa nenhuma (vem da % do contrato); só o frete, se faltar", () => {
    const pix = pedido({
      id: "order_5",
      cotado: null,
      payment_collections: [
        {
          payment_sessions: [sessao("pp_pagarme_pagarme", "pagarme", "ch_5", "pix")],
          payments: [{ captured_at: "2026-09-28T13:00:00Z" }],
        },
      ],
    })
    expect(pendentes([pix], nada)).toEqual([
      { pedido: expect.objectContaining({ id: "order_5" }), taxa: null, frete: true },
    ])
  })

  it("o Pix do Mercado Pago lê a taxa lá", () => {
    const mp = pedido({
      id: "order_4",
      payment_collections: [
        {
          payment_sessions: [sessao("pp_mercadopago_mercadopago", "mercadopago", "123", "pix")],
          payments: [{ captured_at: "2026-09-28T13:00:00Z" }],
        },
      ],
    })
    expect(pendentes([mp], nada)[0].taxa).toEqual({ parceiro: "mercadopago", cobranca: "123" })
  })
})

describe("o serviço numa cotação nova", () => {
  const servicos = [
    {
      codigo: "04510",
      transportadora: "Correios",
      servico: "PAC",
      preco: 22.1,
      prazo: 8,
      prazoTexto: "8",
    },
    {
      codigo: "04014",
      transportadora: "Correios",
      servico: "SEDEX",
      preco: 38.9,
      prazo: 3,
      prazoTexto: "3",
    },
    {
      codigo: "LGX",
      transportadora: "Loggi",
      servico: "Loggi",
      preco: 19.5,
      prazo: 5,
      prazoTexto: "5",
    },
  ]

  it("o mesmo código de serviço que o pedido guardou", () => {
    expect(precoDoServico(servicos, pedido({ id: "o", cotado: 21 }))).toBe(22.1)
  })

  it("sem o código, a faixa pelo nome do método", () => {
    const economica = pedido({ id: "o", cotado: null })
    expect(precoDoServico(servicos, economica)).toBe(19.5)
    const expressa = pedido({
      id: "o",
      shipping_methods: [{ name: "Expressa", data: {} }],
    })
    expect(precoDoServico(servicos, expressa)).toBe(38.9)
    expect(precoDoServico([], economica)).toBeNull()
  })
})
