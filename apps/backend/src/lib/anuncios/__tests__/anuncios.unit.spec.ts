import {
  compraPraMeta,
  compraPraTiktok,
  compraProGa4,
  decidir,
  ESPERA_PELO_RASTRO_MS,
  sha256,
  telefoneComPais,
  type PedidoDaCompra,
} from "../compra"
import { pedidoDaCompra } from "../enviar"
import { idsDoGa, lerRastro } from "../rastro"

/**
 * A compra pelo servidor: o rastro que a loja manda (lido com desconfiança),
 * a decisão de mandar ou não, e o formato de cada plataforma.
 */

const agora = new Date("2026-09-25T15:00:00Z")

const rastroBruto = {
  em: "2026-09-25T14:50:00Z",
  consentimento: "sim",
  parceiros: ["google", "meta", "tiktok"],
  ga: { cookie: "GA1.1.1811307102.1790348181", sessao: "GS2.1.s1790348180$o1$g0$t1790348180$j60" },
  meta: { fbp: "fb.1.1790348181000.123456789", fbc: "fb.1.1790348181000.IwAR3xyz_abc" },
  tiktok: { ttp: "01J9ABCDEFttp.tt.1" },
  ip: "200.100.50.25",
  navegador: "Mozilla/5.0 (iPhone)",
  pagina: "https://www.fuckingbarba.com.br/checkout",
}

const pedido: PedidoDaCompra = {
  id: "order_01ABC",
  numero: 1042,
  email: "  Rafael@Exemplo.com ",
  telefone: "+55 (11) 98888-7777",
  total: 153.01,
  frete: 0,
  cupom: "BARBA10",
  itens: [
    { id: "variant_01", nome: "Óleo para Barba", quantidade: 2, preco: 79.9 },
    { id: "variant_02", nome: "Balm", quantidade: 1, preco: 49.9 },
  ],
  pagoEm: new Date("2026-09-25T14:55:00Z"),
}

describe("o rastro da compra", () => {
  it("com o sim, os cookies, o IP e o navegador passam; o GA4 vira client_id e session_id", () => {
    const r = lerRastro(rastroBruto)
    expect(r).toMatchObject({
      consentimento: "sim",
      parceiros: ["google", "meta", "tiktok"],
      meta: { fbp: "fb.1.1790348181000.123456789", fbc: "fb.1.1790348181000.IwAR3xyz_abc" },
      ip: "200.100.50.25",
    })
    expect(idsDoGa(r!.ga)).toEqual({ clientId: "1811307102.1790348181", sessionId: "1790348180" })
    // O formato de antes do cookie de sessão, e o "$" que chega como %24.
    expect(
      idsDoGa({ cookie: null, sessao: "GS1.1.1790340000.3.1.1790340100.0.0.0" }).sessionId
    ).toBe("1790340000")
    expect(idsDoGa({ cookie: null, sessao: "GS2.1.s1790348180%24o1%24g0" }).sessionId).toBe(
      "1790348180"
    )
  })

  it("sem o sim, só a resposta: nenhum cookie, IP ou navegador fica", () => {
    const r = lerRastro({ ...rastroBruto, consentimento: "nao" })
    expect(r).toEqual({
      em: rastroBruto.em,
      consentimento: "nao",
      parceiros: [],
      ga: null,
      meta: null,
      tiktok: null,
      ip: null,
      navegador: null,
      pagina: null,
    })
  })

  it("o que não tem a cara do campo vira nulo; sem data não há rastro", () => {
    const r = lerRastro({
      ...rastroBruto,
      parceiros: ["meta", "hacker"],
      meta: { fbp: "fb.1.x; drop table", fbc: 42 },
      ip: "<script>",
      pagina: "javascript:alert(1)",
    })
    expect(r?.parceiros).toEqual(["meta"])
    expect(r?.meta).toEqual({ fbp: null, fbc: null })
    expect(r?.ip).toBeNull()
    expect(r?.pagina).toBeNull()
    expect(lerRastro({ ...rastroBruto, em: "ontem" })).toBeNull()
    expect(lerRastro("sim")).toBeNull()
  })
})

describe("mandar ou não, por plataforma", () => {
  const r = lerRastro(rastroBruto)
  const base = { codigo: "123", chave: true, rastro: r, feito: undefined, idadeMs: 60_000 }

  it("com o código, a chave e o sim: manda", () => {
    expect(decidir("meta", base)).toBe("mandar")
    expect(decidir("ga4", base)).toBe("mandar")
    expect(decidir("tiktok", base)).toBe("mandar")
  })

  it("sem o código ou sem a chave, ou já feita: nada (e nada é gravado)", () => {
    expect(decidir("meta", { ...base, codigo: null })).toBe("nada")
    expect(decidir("meta", { ...base, chave: false })).toBe("nada")
    expect(decidir("meta", { ...base, feito: { em: "x", como: "enviada" } })).toBe("nada")
  })

  it("sem o rastro, espera a loja mandar meia hora; depois, dispensa", () => {
    expect(decidir("meta", { ...base, rastro: null })).toBe("esperar")
    expect(decidir("meta", { ...base, rastro: null, idadeMs: ESPERA_PELO_RASTRO_MS + 1 })).toEqual({
      dispensar: "sem-rastro",
    })
  })

  it("sem o sim, ou sem o sim pra esta plataforma: dispensa", () => {
    const nao = lerRastro({ ...rastroBruto, consentimento: "nao" })
    expect(decidir("meta", { ...base, rastro: nao })).toEqual({ dispensar: "sem-consentimento" })
    const soGoogle = lerRastro({ ...rastroBruto, parceiros: ["google"] })
    expect(decidir("meta", { ...base, rastro: soGoogle })).toEqual({
      dispensar: "parceiro-sem-sim",
    })
    expect(decidir("ga4", { ...base, rastro: soGoogle })).toBe("mandar")
    const semGa = lerRastro({ ...rastroBruto, ga: { cookie: null, sessao: null } })
    expect(decidir("ga4", { ...base, rastro: semGa })).toEqual({ dispensar: "sem-client-id" })
  })
})

describe("a compra no formato de cada plataforma", () => {
  const r = lerRastro(rastroBruto)!

  it("o telefone com o 55, só dígitos", () => {
    expect(telefoneComPais("+55 (11) 98888-7777")).toBe("5511988887777")
    expect(telefoneComPais("(47) 3333-4444")).toBe("554733334444")
    expect(telefoneComPais("123")).toBeNull()
  })

  it("Meta: Purchase com o id do pedido, e-mail e telefone embaralhados (sem o +)", () => {
    const corpo = compraPraMeta(pedido, r, agora, null)
    expect(corpo).not.toHaveProperty("test_event_code")
    const [e] = corpo.data as Record<string, unknown>[]
    expect(e).toMatchObject({
      event_name: "Purchase",
      event_id: "order_01ABC",
      action_source: "website",
      event_time: Math.floor(pedido.pagoEm.getTime() / 1000),
      event_source_url: "https://www.fuckingbarba.com.br/checkout",
      user_data: {
        em: [sha256("rafael@exemplo.com")],
        ph: [sha256("5511988887777")],
        fbp: "fb.1.1790348181000.123456789",
        fbc: "fb.1.1790348181000.IwAR3xyz_abc",
        client_ip_address: "200.100.50.25",
        client_user_agent: "Mozilla/5.0 (iPhone)",
      },
      custom_data: {
        currency: "BRL",
        value: 153.01,
        order_id: "order_01ABC",
        content_ids: ["variant_01", "variant_02"],
        num_items: 3,
      },
    })
    expect(compraPraMeta(pedido, r, agora, "TEST123")).toMatchObject({ test_event_code: "TEST123" })
  })

  it("GA4: purchase com o client_id e a sessão do cookie, sem e-mail nem telefone", () => {
    const corpo = compraProGa4(pedido, r, agora)!
    expect(corpo).toMatchObject({
      client_id: "1811307102.1790348181",
      consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" },
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "order_01ABC",
            value: 153.01,
            currency: "BRL",
            coupon: "BARBA10",
            session_id: "1790348180",
          },
        },
      ],
    })
    expect(JSON.stringify(corpo)).not.toMatch(/rafael|98888/i)
  })

  it("TikTok: Purchase com o pixel, o e-mail e o telefone (com o +) embaralhados", () => {
    const corpo = compraPraTiktok(pedido, r, "C4ABCDEFGH1234567890", agora, null)
    expect(corpo).toMatchObject({
      event_source: "web",
      event_source_id: "C4ABCDEFGH1234567890",
      data: [
        {
          event: "Purchase",
          event_id: "order_01ABC",
          user: {
            email: sha256("rafael@exemplo.com"),
            phone: sha256("+5511988887777"),
            ttp: "01J9ABCDEFttp.tt.1",
            ip: "200.100.50.25",
          },
          properties: { currency: "BRL", value: 153.01, order_id: "order_01ABC" },
          page: { url: "https://www.fuckingbarba.com.br/checkout" },
        },
      ],
    })
  })

  it("a hora da compra nunca passa de 6 dias pra trás (a Meta recusa o lote de mais de 7)", () => {
    const antigo = { ...pedido, pagoEm: new Date("2026-09-10T10:00:00Z") }
    const [e] = compraPraMeta(antigo, r, agora, null).data as { event_time: number }[]
    expect(agora.getTime() / 1000 - e.event_time).toBeLessThanOrEqual(6 * 24 * 3600)
  })
})

describe("o pedido pro formato da compra", () => {
  it("só pago; o total é o cobrado, e o cupom não é o da oferta", () => {
    const o = {
      id: "order_1",
      display_id: 7,
      email: "a@b.com",
      total: 100,
      credit_line_total: 20,
      shipping_total: 10,
      items: [
        {
          variant_id: "variant_9",
          product_title: "Shampoo",
          quantity: 2,
          unit_price: 45,
          adjustments: [{ code: "BUMP-OLEO" }, { code: "BARBA10" }],
        },
      ],
      shipping_address: { phone: "+5511999998888" },
      payment_collections: [{ payments: [{ captured_at: "2026-09-25T14:00:00Z" }] }],
    }
    expect(pedidoDaCompra(o)).toMatchObject({
      id: "order_1",
      numero: 7,
      total: 120,
      frete: 10,
      cupom: "BARBA10",
      itens: [{ id: "variant_9", nome: "Shampoo", quantidade: 2, preco: 45 }],
    })
    expect(pedidoDaCompra({ ...o, payment_collections: [{ payments: [] }] })).toBeNull()
  })
})
