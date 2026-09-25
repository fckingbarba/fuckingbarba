import {
  contatoDo,
  linkDoWhatsapp,
  mensagemDoWhatsapp,
  ondeParou,
  telaDosCarrinhos,
  telefoneDoWhatsapp,
  type CarrinhoCru,
  type Chamado,
} from "../carrinhos"

/**
 * Os carrinhos abandonados: em que passo a pessoa parou, com quem falar, o
 * link do WhatsApp, e a lista — uma linha por pessoa, quem voltou e comprou,
 * e o que o marketing não vê.
 */

const AGORA = new Date("2026-09-25T18:00:00Z")
const ha = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString()

const ITENS = [
  { product_title: "Óleo para Barba", quantity: 2, unit_price: 79.9 },
  { product_title: "Balm", quantity: 1, unit_price: 49.9 },
]
const ENDERECO = {
  first_name: "Rafael",
  last_name: "Souza",
  phone: "+55 (11) 98888-7777",
  postal_code: "89036370",
  address_1: "Rua X, 99",
  metadata: { rua: "Rua X", numero: "99" },
}
const carrinho = (extra: Partial<CarrinhoCru> = {}): CarrinhoCru => ({
  id: "cart_01ABCDEFGHIJ",
  email: "rafael@exemplo.com",
  updated_at: ha(120),
  items: ITENS,
  shipping_address: ENDERECO,
  billing_address: { metadata: { documento: { tipo: "cpf", valor: "11144477735" } } },
  shipping_methods: [{ id: "casm_1" }],
  ...extra,
})

describe("onde a pessoa parou", () => {
  it("a régua do checkout: sacola, contato, entrega, pagamento", () => {
    expect(ondeParou(carrinho({ email: null })).etapa).toBe("sacola")
    expect(ondeParou(carrinho({ billing_address: { metadata: {} } })).etapa).toBe("contato")
    expect(ondeParou(carrinho({ shipping_methods: [] })).etapa).toBe("entrega")
    expect(
      ondeParou(carrinho({ shipping_address: { ...ENDERECO, metadata: { rua: "Rua X" } } })).etapa
    ).toBe("entrega")
    expect(ondeParou(carrinho())).toEqual({
      etapa: "pagamento",
      texto: "Chegou no pagamento e não pagou",
    })
  })

  it("no pagamento: tentou e não fechou, ou o pagamento não passou", () => {
    expect(
      ondeParou(carrinho({ payment_collection: { payment_sessions: [{ status: "pending" }] } }))
        .texto
    ).toBe("Tentou pagar e não fechou")
    expect(
      ondeParou(carrinho({ payment_collection: { payment_sessions: [{ status: "error" }] } })).texto
    ).toBe("Tentou pagar e o pagamento não passou")
  })
})

describe("com quem falar", () => {
  it("o telefone pro WhatsApp: só dígitos, com o 55", () => {
    expect(telefoneDoWhatsapp("+55 (11) 98888-7777")).toBe("5511988887777")
    expect(telefoneDoWhatsapp("(47) 3333-4444")).toBe("554733334444")
    expect(telefoneDoWhatsapp("123")).toBeNull()
    expect(telefoneDoWhatsapp(null)).toBeNull()
  })

  it("o nome e o telefone do endereço; sem eles, os da conta", () => {
    expect(contatoDo(carrinho())).toEqual({
      nome: "Rafael Souza",
      email: "rafael@exemplo.com",
      telefone: "5511988887777",
    })
    expect(
      contatoDo(
        carrinho({
          email: null,
          shipping_address: null,
          customer: { email: "Ana@X.com", first_name: "Ana", phone: "47999998888" },
        })
      )
    ).toEqual({ nome: "Ana", email: "ana@x.com", telefone: "5547999998888" })
  })

  it("a mensagem pronta, com o primeiro nome e o produto, no link do WhatsApp", () => {
    const itens = [
      { nome: "Óleo para Barba", quantidade: 2, preco: 79.9 },
      { nome: "Balm", quantidade: 1, preco: 49.9 },
    ]
    const msg = mensagemDoWhatsapp("Rafael Souza", itens)
    expect(msg).toBe(
      "Oi, Rafael! Aqui é da FuckingBarba. Vi que você separou Óleo para Barba e mais 1 produto no site e não chegou a fechar a compra. Ficou alguma dúvida? Posso te ajudar por aqui."
    )
    expect(mensagemDoWhatsapp(null, itens.slice(0, 1))).toMatch(/^Oi! Aqui é da FuckingBarba\./)
    const link = new URL(linkDoWhatsapp("5511988887777", msg))
    expect(`${link.origin}${link.pathname}`).toBe("https://wa.me/5511988887777")
    expect(link.searchParams.get("text")).toBe(msg)
  })
})

describe("a lista", () => {
  const tela = (
    carrinhos: CarrinhoCru[],
    extra: {
      pedidos?: Parameters<typeof telaDosCarrinhos>[0]["pedidos"]
      chamados?: Map<string, Chamado>
      filtro?: "parados" | "agora" | "voltaram"
      verContato?: boolean
    } = {}
  ) =>
    telaDosCarrinhos({
      carrinhos,
      pedidos: extra.pedidos ?? [],
      chamados: extra.chamados ?? new Map(),
      agora: AGORA,
      filtro: extra.filtro ?? "parados",
      verContato: extra.verContato ?? true,
    })

  it("uma linha por pessoa (o carrinho mais recente), e o sem contato só conta", () => {
    const t = tela([
      carrinho({ id: "cart_VELHO000001", updated_at: ha(600) }),
      carrinho({ id: "cart_NOVO0000001", updated_at: ha(90) }),
      carrinho({ id: "cart_ANONIMO0001", email: null, shipping_address: null }),
      carrinho({ id: "cart_VAZIO000001", email: "vazio@x.com", items: [] }),
    ])
    expect(t.carrinhos.map((l) => l.id)).toEqual(["cart_NOVO0000001"])
    expect(t.numeros.semContato).toEqual({ quantos: 1, valor: 209.7 })
    expect(t.carrinhos[0]).toMatchObject({
      quem: { nome: "Rafael Souza", email: "rafael@exemplo.com", telefone: "(11) 98888-7777" },
      itens: "2× Óleo para Barba · Balm",
      unidades: 3,
      valor: 209.7,
      etapa: "pagamento",
      situacao: "parados",
      // A hora de Brasília: 18:00 UTC = 15:00; parado 90 minutos antes.
      quando: "hoje, 13:30",
    })
    expect(t.carrinhos[0].whatsapp).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/)
  })

  it("mexido há menos de 30 minutos: no site agora", () => {
    const t = tela([carrinho({ updated_at: ha(10) })], { filtro: "agora" })
    expect(t.contagem).toEqual({ parados: 0, agora: 1, voltaram: 0 })
    expect(t.carrinhos[0].situacao).toBe("agora")
  })

  it("comprou depois com o mesmo e-mail: voltou, com o pedido; o cancelado e o de antes não contam", () => {
    const t = tela([carrinho({ updated_at: ha(300) })], {
      filtro: "voltaram",
      pedidos: [
        { id: "order_ANTES", display_id: 10, email: "rafael@exemplo.com", created_at: ha(400) },
        {
          id: "order_CANC",
          display_id: 11,
          email: "RAFAEL@exemplo.com",
          created_at: ha(200),
          status: "canceled",
        },
        { id: "order_DEPOIS", display_id: 12, email: "Rafael@Exemplo.com", created_at: ha(100) },
      ],
    })
    expect(t.contagem.voltaram).toBe(1)
    expect(t.carrinhos[0].pedido).toEqual({ id: "order_DEPOIS", numero: 12 })
    expect(t.numeros.voltaram).toEqual({ quantos: 1, valor: 209.7 })
  })

  it("o marketing vê o e-mail mascarado, sem telefone e sem o botão", () => {
    const [l] = tela([carrinho()], { verContato: false }).carrinhos
    expect(l.quem).toEqual({ nome: "Rafael Souza", email: "ra•••@exemplo.com", telefone: null })
    expect(l.whatsapp).toBeNull()
  })

  it("quem já chamou no WhatsApp aparece na linha", () => {
    const [l] = tela([carrinho()], {
      chamados: new Map([["cart_01ABCDEFGHIJ", { quem: "Ana", em: ha(30) }]]),
    }).carrinhos
    expect(l.chamado).toEqual({ quem: "Ana", quando: "hoje, 14:30" })
  })

  it("mais de 30 dias parado sai da lista", () => {
    expect(tela([carrinho({ updated_at: ha(31 * 24 * 60) })]).carrinhos).toHaveLength(0)
  })
})
