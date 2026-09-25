import {
  consentimentosDa,
  emailMascarado,
  fichaDoCliente,
  juntarPessoas,
  listaDeClientes,
  newsletterDa,
  ofertasEmFrase,
  type ClienteCru,
  type InscricaoCrua,
  type PedidoDoCliente,
} from "../clientes"
import type { Contexto } from "../pedido"

/**
 * Os clientes no painel: a mesma pessoa em dois cadastros, o que cada papel
 * vê, as ofertas da conta e da newsletter juntas, e a lista de e-mails.
 */

const AGORA = new Date("2026-09-24T21:10:00-03:00")
const ctx: Contexto = { agora: AGORA, notasDesde: null, janelaDaNota: 5 }
const CPF = "11144477735"

const cliente = (id: string, email: string, extra: Partial<ClienteCru> = {}): ClienteCru => ({
  id,
  email,
  created_at: "2026-09-10T12:00:00-03:00",
  has_account: false,
  ...extra,
})

const pedido = (
  id: string,
  customer_id: string,
  quando: string,
  { pago = true, cancelado = false, total = 100, cidade = "São Paulo", documento = "" } = {}
): PedidoDoCliente => ({
  id,
  display_id: Number(id.replace(/\D/g, "")) || 1,
  created_at: quando,
  status: cancelado ? "canceled" : "pending",
  email: "x@exemplo.com",
  customer_id,
  total,
  original_total: total,
  shipping_address: {
    first_name: "Rafael",
    last_name: "Souza",
    city: cidade,
    province: "sp",
    phone: "+5511988887777",
    address_1: "Rua Augusta, 1200",
    address_2: "apto 51 — Consolação",
    postal_code: "01304001",
  },
  billing_address: documento
    ? { metadata: { documento: { tipo: "cpf", valor: documento } } }
    : null,
  payment_collections: [{ payments: pago ? [{ captured_at: quando }] : [] }],
})

const inscricao = (email: string, quando: string): InscricaoCrua => ({
  id: `news_${email}`,
  email,
  origem: "rodape",
  consentido_em: quando,
})

describe("uma pessoa, um e-mail", () => {
  it("o convidado e a conta com o mesmo e-mail viram uma pessoa, a conta primeiro, e os pedidos somam", () => {
    const pessoas = juntarPessoas(
      [
        cliente("cus_convidado", "Rafael@Exemplo.com"),
        cliente("cus_conta", "rafael@exemplo.com", { has_account: true, first_name: "Rafa" }),
      ],
      [
        pedido("o1", "cus_convidado", "2026-09-20T10:00:00-03:00"),
        pedido("o2", "cus_conta", "2026-09-23T10:00:00-03:00"),
      ],
      []
    )
    expect(pessoas).toHaveLength(1)
    expect(pessoas[0]!.clientes.map((c) => c.id)).toEqual(["cus_conta", "cus_convidado"])
    expect(pessoas[0]!.pedidos.map((o) => o.id)).toEqual(["o2", "o1"])
  })
})

describe("a lista", () => {
  const pessoas = juntarPessoas(
    [
      cliente("cus_a", "ana@exemplo.com", { first_name: "Ana", last_name: "Lima" }),
      cliente("cus_b", "bruno@exemplo.com", {
        metadata: { ofertas: { email: "2026-09-22T10:00:00-03:00", whatsapp: null } },
      }),
      cliente("cus_c", "joao@exemplo.com", { first_name: "João", last_name: "Nunes" }),
    ],
    [
      pedido("o1", "cus_a", "2026-09-24T20:52:00-03:00", { total: 128.5 }),
      pedido("o2", "cus_a", "2026-09-21T10:00:00-03:00", { total: 79.9, pago: false }),
      pedido("o3", "cus_a", "2026-09-20T10:00:00-03:00", { total: 50, cancelado: true }),
      pedido("o4", "cus_b", "2026-09-23T10:00:00-03:00", { cidade: "Belo Horizonte" }),
    ],
    [inscricao("joao@exemplo.com", "2026-09-02T09:00:00-03:00")]
  )

  it("dono: todos, do que comprou por último pro mais antigo; gastou só o pago e não cancelado", () => {
    const l = listaDeClientes(pessoas, "dono", AGORA)
    expect(l.clientes.map((c) => c.email)).toEqual([
      "ana@exemplo.com",
      "bruno@exemplo.com",
      "joao@exemplo.com",
    ])
    const ana = l.clientes[0]!
    expect(ana).toMatchObject({
      id: "cus_a",
      nome: "Ana Lima",
      cidade: "São Paulo/SP",
      pedidos: 3,
      gastou: 128.5,
      ultimo: "hoje, 20:52",
      conta: false,
      ofertas: null,
    })
    expect(l.clientes[1]!.nome).toBe("Rafael Souza")
    expect(l.clientes[2]).toMatchObject({
      pedidos: 0,
      gastou: 0,
      cidade: null,
      ofertas: "e-mail · desde 02/09",
    })
    expect(l.total).toBe(3)
    expect(l.comOfertas).toBe(2)
  })

  it("marketing: só quem aceitou ofertas, e sem a cidade", () => {
    const l = listaDeClientes(pessoas, "marketing", AGORA)
    expect(l.clientes.map((c) => c.email)).toEqual(["bruno@exemplo.com", "joao@exemplo.com"])
    expect(l.clientes.every((c) => c.cidade === null)).toBe(true)
    expect(l.total).toBe(3)
  })

  it("a busca: nome ou e-mail, sem acento", () => {
    expect(listaDeClientes(pessoas, "dono", AGORA, "joao").clientes.map((c) => c.id)).toEqual([
      "cus_c",
    ])
    expect(listaDeClientes(pessoas, "dono", AGORA, "BRUNO@").clientes.map((c) => c.id)).toEqual([
      "cus_b",
    ])
  })
})

describe("as ofertas: a conta e a newsletter juntas", () => {
  it("cada 'sim' com a data e o lugar; data que não é data não vale", () => {
    const [p] = juntarPessoas(
      [
        cliente("cus_a", "ana@exemplo.com", {
          metadata: { ofertas: { email: "2026-09-24T09:00:00-03:00", whatsapp: "ontem" } },
        }),
      ],
      [],
      [inscricao("ana@exemplo.com", "2026-09-12T09:00:00-03:00")]
    )
    const consentimentos = consentimentosDa(p!)
    expect(consentimentos.map((c) => [c.canal, c.origem, c.onde])).toEqual([
      ["email", "conta", "na conta"],
      ["email", "newsletter", "no rodapé"],
    ])
    expect(ofertasEmFrase(consentimentos, AGORA)).toBe("e-mail · desde 12/09")
  })

  it("e-mail e WhatsApp, desde hoje", () => {
    const [p] = juntarPessoas(
      [
        cliente("cus_a", "ana@exemplo.com", {
          metadata: {
            ofertas: { email: "2026-09-24T09:00:00-03:00", whatsapp: "2026-09-24T09:00:00-03:00" },
          },
        }),
      ],
      [],
      []
    )
    expect(ofertasEmFrase(consentimentosDa(p!), AGORA)).toBe("e-mail e WhatsApp · desde hoje")
  })
})

describe("a ficha", () => {
  const [p] = juntarPessoas(
    [cliente("cus_a", "ana@exemplo.com", { first_name: "Ana", phone: "+5511977776666" })],
    [pedido("o1", "cus_a", "2026-09-24T20:52:00-03:00", { documento: CPF })],
    [inscricao("ana@exemplo.com", "2026-09-22T09:00:00-03:00")]
  )
  const vazio = new Map()

  it("dono: o CPF inteiro, o celular, o endereço e os pedidos", () => {
    const f = fichaDoCliente(p!, "dono", ctx, vazio, vazio)!
    expect(f.dados).toEqual({
      celular: "(11) 97777-6666",
      documento: { tipo: "cpf", mascarado: "•••.444.777-••", inteiro: "111.444.777-35" },
      endereco: "Rua Augusta, 1200 — apto 51 — Consolação — São Paulo/SP — 01304-001",
    })
    expect(f.pedidos?.map((l) => l.id)).toEqual(["o1"])
    expect(f.ofertas).toEqual([{ canal: "E-mail", onde: "no rodapé", desde: "22/09" }])
    expect(f.resumo).toEqual({ pedidos: 1, gastou: 100 })
  })

  it("operação: o CPF mascarado — o inteiro nem sai daqui", () => {
    const f = fichaDoCliente(p!, "operacao", ctx, vazio, vazio)!
    expect(f.dados?.documento).toEqual({ tipo: "cpf", mascarado: "•••.444.777-••", inteiro: null })
  })

  it("marketing: sem dados pessoais nem pedidos; e quem não aceitou ofertas não existe", () => {
    const f = fichaDoCliente(p!, "marketing", ctx, vazio, vazio)!
    expect(f.dados).toBeNull()
    expect(f.pedidos).toBeNull()
    expect(f.resumo).toEqual({ pedidos: 1, gastou: 100 })
    const [semOfertas] = juntarPessoas([cliente("cus_b", "bruno@exemplo.com")], [], [])
    expect(fichaDoCliente(semOfertas!, "marketing", ctx, vazio, vazio)).toBeNull()
    expect(fichaDoCliente(semOfertas!, "operacao", ctx, vazio, vazio)).not.toBeNull()
  })

  it("o documento da conta vale antes do do pedido", () => {
    const [comConta] = juntarPessoas(
      [
        cliente("cus_a", "ana@exemplo.com", {
          metadata: { documento: { tipo: "cpf", valor: "52998224725" } },
        }),
      ],
      [pedido("o1", "cus_a", "2026-09-24T20:52:00-03:00", { documento: CPF })],
      []
    )
    expect(fichaDoCliente(comConta!, "dono", ctx, vazio, vazio)?.dados?.documento?.inteiro).toBe(
      "529.982.247-25"
    )
  })
})

describe("a newsletter: o rodapé e a conta, numa lista só", () => {
  const inscricoes = [
    inscricao("ana@exemplo.com", "2026-09-12T09:00:00-03:00"),
    inscricao("leo@exemplo.com", "2026-09-24T09:00:00-03:00"),
  ]
  const pessoas = juntarPessoas(
    [
      cliente("cus_a", "ana@exemplo.com", {
        metadata: { ofertas: { email: "2026-09-20T09:00:00-03:00" } },
      }),
      cliente("cus_b", "bruno@exemplo.com", {
        metadata: { ofertas: { email: "2026-09-23T09:00:00-03:00" } },
      }),
      cliente("cus_c", "caio@exemplo.com"),
    ],
    [],
    inscricoes
  )

  it("um e-mail uma vez, com a primeira data e as origens; o de cliente leva pra ficha", () => {
    const n = newsletterDa(pessoas, inscricoes, AGORA)
    expect(n.inscritos.map((i) => [i.email, i.origem, i.desde, i.clienteId])).toEqual([
      ["leo@exemplo.com", "rodapé", "hoje", null],
      ["bruno@exemplo.com", "conta", "ontem", "cus_b"],
      ["ana@exemplo.com", "rodapé e conta", "12/09", "cus_a"],
    ])
    expect(n.numeros).toEqual({ total: 3, semana: 2, rodape: 2, conta: 2 })
  })
})

it("o e-mail no registro vai mascarado", () => {
  expect(emailMascarado("rafael.souza@example.com")).toBe("ra•••@example.com")
})
