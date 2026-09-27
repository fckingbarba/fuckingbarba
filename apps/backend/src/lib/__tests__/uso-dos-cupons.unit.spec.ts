import { contaUso, decidirDevolucao, usoDoPedido, type PedidoDoUso } from "../uso-dos-cupons"

/** Um Pix que venceu: cancelado, com o cupom de 1 uso num produto e na entrega. */
function pedido(extra: Partial<PedidoDoUso> = {}): PedidoDoUso {
  return {
    id: "order_01ABC",
    status: "canceled",
    email: "rafael@exemplo.com",
    customer_id: "cus_01",
    metadata: null,
    items: [
      { adjustments: [{ code: "YMW4C8", amount: 6.59 }] },
      {
        adjustments: [
          { code: "YMW4C8", amount: 4.99 },
          { code: "BUMP-OLEO-3F9A12C7", amount: 5.49 },
        ],
      },
    ],
    shipping_methods: [{ adjustments: [{ code: "FRETEG", amount: "23.7" }] }],
    ...extra,
  }
}

describe("o uso que o fechamento registrou", () => {
  it("um por ajuste com código, de produto e de frete, com o valor — como o complete-cart", () => {
    expect(usoDoPedido(pedido())).toEqual({
      acoes: [
        { code: "YMW4C8", amount: 6.59 },
        { code: "YMW4C8", amount: 4.99 },
        { code: "BUMP-OLEO-3F9A12C7", amount: 5.49 },
        { code: "FRETEG", amount: 23.7 },
      ],
      contexto: { customer_id: "cus_01", customer_email: "rafael@exemplo.com" },
    })
  })

  it("ajuste sem código (o manual do admin) fica de fora; sem conta, sem cliente", () => {
    const uso = usoDoPedido(
      pedido({
        customer_id: null,
        items: [{ adjustments: [{ code: null, amount: 3 }, null] }, null],
        shipping_methods: null,
      })
    )
    expect(uso.acoes).toEqual([])
    expect(uso.contexto.customer_id).toBeNull()
  })
})

describe("quando o uso volta", () => {
  it("pedido cancelado com cupom: devolve, com cada código uma vez na lista", () => {
    const d = decidirDevolucao(pedido())
    expect(d.devolver).toBe(true)
    expect(d.devolver && d.codigos).toEqual(["YMW4C8", "BUMP-OLEO-3F9A12C7", "FRETEG"])
  })

  it("pedido que não está cancelado não devolve", () => {
    expect(decidirDevolucao(pedido({ status: "pending" }))).toEqual({
      devolver: false,
      motivo: "nao-cancelado",
    })
  })

  it("uma vez só: com o registro no metadata, não devolve de novo", () => {
    const jaFoi = pedido({
      metadata: {
        fb_cupons: { uso_devolvido: { em: "2026-09-26T22:00:00.000Z", codigos: ["YMW4C8"] } },
      },
    })
    expect(decidirDevolucao(jaFoi)).toEqual({ devolver: false, motivo: "ja-devolvido" })
  })

  it("pedido cancelado sem cupom não faz nada", () => {
    expect(
      decidirDevolucao(pedido({ items: [{ adjustments: [] }], shipping_methods: [] }))
    ).toEqual({ devolver: false, motivo: "sem-cupom" })
  })
})

describe("o que conta uso", () => {
  it("só o código com limite ou com orçamento de campanha; a oferta e o ilimitado ficam de fora", () => {
    const { acoes } = usoDoPedido(pedido())
    expect(
      contaUso(acoes, [
        { code: "YMW4C8", limit: 1 },
        { code: "BUMP-OLEO-3F9A12C7", limit: null },
        { code: "FRETEG", limit: null, campaign: { budget: { id: "camp_b" } } },
      ])
    ).toEqual([
      { code: "YMW4C8", amount: 6.59 },
      { code: "YMW4C8", amount: 4.99 },
      { code: "FRETEG", amount: 23.7 },
    ])
    expect(contaUso(acoes, [{ code: "BUMP-OLEO-3F9A12C7", limit: null }])).toEqual([])
    expect(contaUso(acoes, [])).toEqual([])
  })
})
