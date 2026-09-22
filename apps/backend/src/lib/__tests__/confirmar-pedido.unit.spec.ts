import { decidir, lerRegistro, paraPedidoDoEmail, type PedidoLido } from "../confirmar-pedido"
import { fraseDoPagamento } from "../emails/pedido-confirmado"

/** Um pedido pago no Pix, como a consulta do `confirmar-pedido.ts` devolve. */
function pedido(extra: Partial<PedidoLido> = {}): PedidoLido {
  return {
    id: "order_01ABC",
    display_id: 1042,
    email: "rafael@exemplo.com",
    status: "pending",
    metadata: null,
    item_subtotal: 99.8,
    subtotal: 123.5,
    discount_total: 0,
    shipping_total: 23.7,
    total: 123.5,
    items: [
      {
        title: "Shampoo para Barba FuckingBarba 120ml",
        product_title: "Shampoo para Barba FuckingBarba 120ml",
        variant_title: "Único",
        thumbnail: "https://exemplo.supabase.co/storage/v1/object/public/p/shampoo.webp",
        quantity: 2,
        unit_price: 49.9,
        total: 99.8,
      },
    ],
    shipping_methods: [{ name: "Entrega econômica" }],
    shipping_address: {
      first_name: "Rafael",
      last_name: "Teste",
      address_1: "Rua Doutor Pedro Zimmermann, 99",
      address_2: "Casa 2 — Itoupava Central",
      city: "Blumenau",
      province: "sc",
      postal_code: "89036370",
      metadata: { complemento: "Casa 2", bairro: "Itoupava Central" },
    },
    payment_collections: [
      {
        payments: [{ captured_at: "2026-09-22T12:00:00.000Z" }],
        payment_sessions: [
          {
            provider_id: "pp_pagarme_pagarme",
            data: {
              pagarme: {
                forma: "pix",
                situacao: "pago",
                valor: 12350,
                pedido: "or_1",
                cobranca: "ch_1",
                parcelas: 1,
                pix: null,
                cartao: null,
                recusa: null,
                estornado: 0,
              },
            },
          },
        ],
      },
    ],
    fulfillments: [],
    ...extra,
  }
}

const doCartao = (cartao: { bandeira: string; final: string } | null, parcelas = 3) => ({
  payment_collections: [
    {
      payments: [{ captured_at: "2026-09-22T12:00:00.000Z" }],
      payment_sessions: [
        {
          provider_id: "pp_pagarme_pagarme",
          data: { pagarme: { forma: "cartao", situacao: "pago", parcelas, cartao } },
        },
      ],
    },
  ],
})

describe("quando a confirmação sai", () => {
  it("pedido pago no Pagar.me, sem registro, ainda na casa: sai", () => {
    expect(decidir(pedido())).toEqual({ mandar: true })
  })

  it("já registrado não sai de novo — mandado, dispensado ou recusado", () => {
    for (const como of ["email", "dispensado", "recusado"]) {
      const metadata = { emails: { confirmado: { em: "2026-09-22T12:00:00.000Z", como } } }
      expect(decidir(pedido({ metadata }))).toEqual({ mandar: false, motivo: "ja-registrado" })
    }
  })

  it("o que mais estiver no metadata não conta como registro", () => {
    expect(lerRegistro({ cliente_ga: "123", emails: {} })).toBeNull()
    expect(lerRegistro({ emails: { confirmado: { como: "email" } } })).toBeNull()
    expect(decidir(pedido({ metadata: { cliente_ga: "123" } }))).toEqual({ mandar: true })
  })

  it("cancelado não confirma, mesmo com o pagamento capturado (o estorno vem depois)", () => {
    expect(decidir(pedido({ status: "canceled" }))).toEqual({ mandar: false, motivo: "cancelado" })
  })

  it("Pix esperando ou cartão em análise: ainda não", () => {
    const esperando = pedido({
      payment_collections: [
        { payments: [], payment_sessions: pedido().payment_collections![0]!.payment_sessions },
      ],
    })
    expect(decidir(esperando)).toEqual({ mandar: false, motivo: "nao-pago" })
    const autorizado = pedido({
      payment_collections: [{ payments: [{ captured_at: null }], payment_sessions: [] }],
    })
    expect(decidir(autorizado)).toEqual({ mandar: false, motivo: "nao-pago" })
  })

  it("pedido do provisório (sem o Pagar.me) não diz 'Pix recebido'", () => {
    const provisorio = pedido({
      payment_collections: [
        {
          payments: [{ captured_at: "2026-09-22T12:00:00.000Z" }],
          payment_sessions: [{ provider_id: "pp_system_default", data: {} }],
        },
      ],
    })
    expect(decidir(provisorio)).toEqual({ mandar: false, motivo: "sem-pagarme" })
  })

  it("pedido que já saiu pra entrega não recebe 'falta enviar' depois do 'a caminho'", () => {
    const postado = pedido({ fulfillments: [{ shipped_at: "2026-09-22T15:00:00.000Z" }] })
    expect(decidir(postado)).toEqual({ mandar: false, motivo: "ja-saiu" })
    const entregue = pedido({
      fulfillments: [{ shipped_at: null, delivered_at: "2026-09-23T10:00:00.000Z" }],
    })
    expect(decidir(entregue)).toEqual({ mandar: false, motivo: "ja-saiu" })
    const separado = pedido({ fulfillments: [{ shipped_at: null, delivered_at: null }] })
    expect(decidir(separado)).toEqual({ mandar: true })
  })

  it("sem e-mail no pedido, não tem pra quem", () => {
    expect(decidir(pedido({ email: "" }))).toEqual({ mandar: false, motivo: "sem-email" })
    expect(decidir(pedido({ email: null }))).toEqual({ mandar: false, motivo: "sem-email" })
  })
})

describe("o pedido no formato do e-mail", () => {
  it("os números são os do Medusa, com os produtos sem o frete", () => {
    const p = paraPedidoDoEmail(pedido())
    expect(p).toMatchObject({
      id: "order_01ABC",
      numero: 1042,
      email: "rafael@exemplo.com",
      subtotal: 99.8,
      desconto: 0,
      frete: 23.7,
      total: 123.5,
      formaDeEntrega: "Entrega econômica",
    })
    expect(p.itens).toEqual([
      {
        nome: "Shampoo para Barba FuckingBarba 120ml",
        variante: null,
        imagem: "https://exemplo.supabase.co/storage/v1/object/public/p/shampoo.webp",
        quantidade: 2,
        precoUnitario: 49.9,
        total: 99.8,
      },
    ])
  })

  it("o endereço como a tela de obrigado: complemento e bairro, CEP com traço, UF em caixa alta", () => {
    expect(paraPedidoDoEmail(pedido()).entrega).toEqual({
      nome: "Rafael Teste",
      linha1: "Rua Doutor Pedro Zimmermann, 99",
      linha2: "Casa 2 — Itoupava Central",
      cidade: "Blumenau",
      uf: "SC",
      cep: "89036-370",
    })
    const semMetadata = pedido({
      shipping_address: { ...pedido().shipping_address!, metadata: null },
    })
    expect(paraPedidoDoEmail(semMetadata).entrega?.linha2).toBe("Casa 2 — Itoupava Central")
  })

  it("variante de verdade aparece; 'Único' não", () => {
    const item = { ...pedido().items![0]!, variant_title: "Amadeirado" }
    expect(paraPedidoDoEmail(pedido({ items: [item] })).itens[0].variante).toBe("Amadeirado")
  })

  it("Pix e cartão saem da sessão do Pagar.me", () => {
    expect(paraPedidoDoEmail(pedido()).pagamento).toEqual({ forma: "pix" })
    expect(
      paraPedidoDoEmail(pedido(doCartao({ bandeira: "Visa", final: "0010" }))).pagamento
    ).toEqual({
      forma: "cartao",
      bandeira: "Visa",
      final: "0010",
      parcelas: 3,
    })
  })
})

describe("a frase do pagamento", () => {
  it("cartão com tudo: a frase do obrigado", () => {
    expect(
      fraseDoPagamento({ forma: "cartao", bandeira: "Visa", final: "0010", parcelas: 3 })
    ).toBe(
      "Pagamento aprovado no cartão Visa final 0010, em 3x sem juros. Já estamos separando o seu pedido."
    )
  })

  it("sem bandeira nem final, a frase encolhe em vez de ficar com buraco", () => {
    const sem = paraPedidoDoEmail(pedido(doCartao(null, 1))).pagamento
    expect(fraseDoPagamento(sem)).toBe(
      "Pagamento aprovado no cartão. Já estamos separando o seu pedido."
    )
  })
})
