import {
  decidirAvisoDeVenda,
  lerRegistroDaVenda,
  pagoEm,
  paraVenda,
  type PedidoDaVenda,
} from "../avisar-venda"
import { emailDeVendaNova } from "../emails/venda-nova"

/** Um pedido pago no Pix, como a consulta do `avisar-venda.ts` devolve. */
function pedido(extra: Partial<PedidoDaVenda> = {}): PedidoDaVenda {
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
        adjustments: [],
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
            data: { pagarme: { forma: "pix", situacao: "pago", parcelas: 1, cartao: null } },
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

describe("quando o aviso de venda sai", () => {
  it("pedido pago no Pagar.me, sem registro, ainda na casa: sai", () => {
    expect(decidirAvisoDeVenda(pedido())).toEqual({ mandar: true })
  })

  it("já registrado não sai de novo — mandado ou dispensado", () => {
    for (const como of ["email", "dispensado"]) {
      const metadata = { emails: { venda: { em: "2026-09-22T12:00:00.000Z", como } } }
      expect(decidirAvisoDeVenda(pedido({ metadata }))).toEqual({
        mandar: false,
        motivo: "ja-registrado",
      })
    }
  })

  it("o registro da confirmação do cliente não conta como o do aviso", () => {
    const metadata = { emails: { confirmado: { em: "2026-09-22T12:00:00.000Z", como: "email" } } }
    expect(decidirAvisoDeVenda(pedido({ metadata }))).toEqual({ mandar: true })
    expect(lerRegistroDaVenda(metadata)).toBeNull()
    expect(lerRegistroDaVenda({ emails: { venda: { como: "email" } } })).toBeNull()
  })

  it("cancelado não é venda — nem com o Pix pago depois do cancelamento", () => {
    expect(decidirAvisoDeVenda(pedido({ status: "canceled" }))).toEqual({
      mandar: false,
      motivo: "cancelado",
    })
  })

  it("Pix esperando ou cartão em análise: ainda não", () => {
    const sessoes = pedido().payment_collections![0]!.payment_sessions
    const esperando = pedido({ payment_collections: [{ payments: [], payment_sessions: sessoes }] })
    expect(decidirAvisoDeVenda(esperando)).toEqual({ mandar: false, motivo: "nao-pago" })
    const autorizado = pedido({
      payment_collections: [{ payments: [{ captured_at: null }], payment_sessions: sessoes }],
    })
    expect(decidirAvisoDeVenda(autorizado)).toEqual({ mandar: false, motivo: "nao-pago" })
  })

  it("pedido do provisório (sem o Pagar.me) não avisa", () => {
    const provisorio = pedido({
      payment_collections: [
        {
          payments: [{ captured_at: "2026-09-22T12:00:00.000Z" }],
          payment_sessions: [{ provider_id: "pp_system_default", data: {} }],
        },
      ],
    })
    expect(decidirAvisoDeVenda(provisorio)).toEqual({ mandar: false, motivo: "sem-pagarme" })
  })

  it("pedido que já saiu pra entrega é venda velha", () => {
    const postado = pedido({ fulfillments: [{ shipped_at: "2026-09-22T15:00:00.000Z" }] })
    expect(decidirAvisoDeVenda(postado)).toEqual({ mandar: false, motivo: "ja-saiu" })
    const separado = pedido({ fulfillments: [{ shipped_at: null, delivered_at: null }] })
    expect(decidirAvisoDeVenda(separado)).toEqual({ mandar: true })
  })

  it("não precisa do e-mail de quem comprou: o aviso vai pro dono", () => {
    expect(decidirAvisoDeVenda(pedido({ email: null }))).toEqual({ mandar: true })
  })
})

describe("a hora do pagamento", () => {
  it("é a captura mais recente do pedido", () => {
    const dois = pedido({
      payment_collections: [
        {
          payments: [
            { captured_at: "2026-09-22T12:00:00.000Z" },
            { captured_at: new Date("2026-09-22T12:05:00.000Z") },
            { captured_at: null },
          ],
          payment_sessions: [],
        },
      ],
    })
    expect(pagoEm(dois)?.toISOString()).toBe("2026-09-22T12:05:00.000Z")
    expect(pagoEm({ payment_collections: [] })).toBeNull()
    expect(pagoEm({ payment_collections: [{ payments: [{ captured_at: "lixo" }] }] })).toBeNull()
  })
})

describe("o pedido no formato do aviso", () => {
  it("os números e os itens são os do e-mail do cliente", () => {
    const v = paraVenda(pedido())
    expect(v).toMatchObject({
      id: "order_01ABC",
      numero: 1042,
      subtotal: 99.8,
      desconto: 0,
      frete: 23.7,
      total: 123.5,
      formaDeEntrega: "Entrega econômica",
      pagamento: { forma: "pix" },
      cupons: [],
    })
    expect(v.pagoEm.toISOString()).toBe("2026-09-22T12:00:00.000Z")
    expect(v.itens).toEqual([
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

  it("o cartão vai com a bandeira e as parcelas — e sem o final", () => {
    const v = paraVenda(pedido(doCartao({ bandeira: "Visa", final: "0010" })))
    expect(v.pagamento).toEqual({ forma: "cartao", bandeira: "Visa", parcelas: 3 })
    expect(JSON.stringify(v)).not.toContain("0010")
  })

  it("nada de quem comprou chega no e-mail do dono", () => {
    const e = emailDeVendaNova(
      "dono@loja.com",
      paraVenda(pedido(doCartao({ bandeira: "Visa", final: "0010" })))
    )
    for (const dado of [
      "rafael@exemplo.com",
      "Rafael",
      "Zimmermann",
      "Blumenau",
      "89036",
      "0010",
    ]) {
      expect(e.html).not.toContain(dado)
      expect(e.texto).not.toContain(dado)
    }
  })

  it("os cupons do pedido, sem a oferta do checkout e sem repetir", () => {
    const item = pedido().items![0]!
    const v = paraVenda(
      pedido({
        items: [
          { ...item, adjustments: [{ code: " BARBA10 " }, { code: "BUMP-OLEO-3F9A12C7" }] },
          { ...item, adjustments: [{ code: "BARBA10" }, null, { code: null }] },
        ],
      })
    )
    expect(v.cupons).toEqual(["BARBA10"])
  })

  it("sem captura (não chega aqui pela decisão), a hora é a de agora", () => {
    const agora = new Date("2026-09-26T18:00:00.000Z")
    const v = paraVenda(pedido({ payment_collections: [] }), agora)
    expect(v.pagoEm).toBe(agora)
  })
})
