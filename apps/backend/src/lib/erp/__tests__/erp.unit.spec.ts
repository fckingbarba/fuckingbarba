import { abrir, fechar } from "../cofre"
import { estoqueEspelhado } from "../estoque"
import { minutosDaJanela } from "../conexao"
import {
  decidirNota,
  diaEmBrasilia,
  esperaDaNota,
  montarPedidoParaNota,
  quandoSaiANota,
  type PedidoLido,
} from "../notas"

const CREDENCIAIS = {
  acesso: "acesso-1",
  renovacao: "renovacao-1",
  expiraEm: "2026-09-23T20:00:00.000Z",
}

describe("o cofre das credenciais", () => {
  it("fecha e abre com o mesmo segredo, e o texto fechado não mostra o token", () => {
    const fechado = fechar(CREDENCIAIS, "segredo-do-app", "bling")
    expect(fechado).not.toContain("acesso-1")
    expect(abrir(fechado, "segredo-do-app", "bling")).toEqual(CREDENCIAIS)
  })

  it("com outro segredo, de outro ERP, ou adulterado, não abre", () => {
    const fechado = fechar(CREDENCIAIS, "segredo-do-app", "bling")
    expect(abrir(fechado, "segredo-trocado", "bling")).toBeNull()
    expect(abrir(fechado, "segredo-do-app", "outro")).toBeNull()
    const [v, iv, marca, corpo] = fechado.split(".")
    const trocado = corpo!.slice(0, -2) + (corpo!.endsWith("A") ? "BB" : "AA")
    expect(abrir([v, iv, marca, trocado].join("."), "segredo-do-app", "bling")).toBeNull()
    expect(abrir("lixo", "segredo-do-app", "bling")).toBeNull()
  })

  it("cada fechamento é diferente (o vetor é aleatório)", () => {
    expect(fechar(CREDENCIAIS, "s", "bling")).not.toBe(fechar(CREDENCIAIS, "s", "bling"))
  })
})

describe("o estoque espelhado", () => {
  it("é o saldo do ERP mais o que o Medusa reservou pros pedidos que já estão lá", () => {
    expect(estoqueEspelhado(10, 0)).toBe(10)
    expect(estoqueEspelhado(9, 1)).toBe(10)
  })

  it("nunca negativo, e sem fração", () => {
    expect(estoqueEspelhado(-3, 1)).toBe(0)
    expect(estoqueEspelhado(4.7, 0)).toBe(4)
    expect(estoqueEspelhado(2, -5)).toBe(2)
  })
})

const AGORA = new Date("2026-09-23T15:00:00.000Z")
const DESDE = new Date("2026-09-23T12:00:00.000Z")
const pago = (quando = "2026-09-23T13:00:00.000Z") => ({
  status: "pending",
  payment_collections: [{ payments: [{ captured_at: quando }] }],
})
const nota = (
  n: Partial<{ situacao: string; definitivo: boolean; proxima_em: string | null }>
) => ({
  situacao: "a-emitir",
  definitivo: false,
  proxima_em: null,
  ...n,
})

describe("quais pedidos ganham nota", () => {
  const decidir = (
    o: Parameters<typeof decidirNota>[0],
    n: Parameters<typeof decidirNota>[1] = null
  ) => decidirNota(o, n, { desde: DESDE, agora: AGORA })

  it("o pago depois de conectar, sem nota, emite", () => {
    expect(decidir(pago())).toBe("emitir")
  })

  it("o pago antes de conectar fica com a nota feita à mão", () => {
    expect(decidir(pago("2026-09-23T11:00:00.000Z"))).toBe("pago-antes")
  })

  it("o cancelado, o não pago e o que já tem nota, não", () => {
    expect(decidir({ ...pago(), status: "canceled" })).toBe("cancelado")
    expect(decidir({ status: "pending", payment_collections: [] })).toBe("nao-pago")
    expect(decidir(pago(), nota({ situacao: "autorizada" }))).toBe("ja-tem")
    expect(decidir(pago(), nota({ situacao: "desfeita" }))).toBe("ja-tem")
  })

  it("nota na SEFAZ ou esperando correção é acompanhada — mesmo com o pedido cancelado", () => {
    expect(decidir(pago(), nota({ situacao: "processando" }))).toBe("acompanhar")
    expect(decidir({ ...pago(), status: "canceled" }, nota({ situacao: "rejeitada" }))).toBe(
      "acompanhar"
    )
  })

  it("recusa definitiva não insiste; a outra espera a vez", () => {
    expect(decidir(pago(), nota({ definitivo: true }))).toBe("recusado")
    expect(decidir(pago(), nota({ proxima_em: "2026-09-23T15:10:00.000Z" }))).toBe("esperando")
    expect(decidir(pago(), nota({ proxima_em: "2026-09-23T14:50:00.000Z" }))).toBe("emitir")
  })

  it("a espera cresce: 10 min, 20, 40… até 6 horas", () => {
    expect(esperaDaNota(1)).toBe(10 * 60 * 1000)
    expect(esperaDaNota(3)).toBe(40 * 60 * 1000)
    expect(esperaDaNota(30)).toBe(6 * 60 * 60 * 1000)
  })
})

describe("a janela de cancelamento antes da nota", () => {
  const HORA = 60 * 60 * 1000
  const decidir = (
    o: Parameters<typeof decidirNota>[0],
    n: Parameters<typeof decidirNota>[1] = null,
    janela = 2 * HORA
  ) => decidirNota(o, n, { desde: DESDE, agora: AGORA, janela })

  it("dentro dela, só o pedido vai pro ERP; fechada, a nota sai", () => {
    // Pago 14:00, agora 15:00: com 2 horas, a nota sai às 16:00.
    expect(decidir(pago("2026-09-23T14:00:00.000Z"))).toBe("so-o-pedido")
    expect(decidir(pago("2026-09-23T14:00:00.000Z"), nota({}))).toBe("so-o-pedido")
    // Pago 12:30: a janela fechou às 14:30.
    expect(decidir(pago("2026-09-23T12:30:00.000Z"))).toBe("emitir")
    // Na hora (0), ou quem clicou "Emitir agora": sem janela.
    expect(decidir(pago("2026-09-23T14:00:00.000Z"), null, 0)).toBe("emitir")
  })

  it("conta do primeiro pagamento", () => {
    const doisPagamentos = {
      status: "pending",
      payment_collections: [
        { payments: [{ captured_at: "2026-09-23T14:50:00.000Z" }] },
        { payments: [{ captured_at: "2026-09-23T12:40:00.000Z" }] },
      ],
    }
    expect(quandoSaiANota(doisPagamentos, 2 * HORA).toISOString()).toBe("2026-09-23T14:40:00.000Z")
    expect(decidir(doisPagamentos)).toBe("emitir")
  })

  it("não passa na frente do resto: cancelado, recusado e a espera da tentativa valem antes", () => {
    const agora = pago("2026-09-23T14:30:00.000Z")
    expect(decidir({ ...agora, status: "canceled" })).toBe("cancelado")
    expect(decidir(agora, nota({ definitivo: true }))).toBe("recusado")
    expect(decidir(agora, nota({ proxima_em: "2026-09-23T15:10:00.000Z" }))).toBe("esperando")
    expect(decidir(agora, nota({ situacao: "autorizada" }))).toBe("ja-tem")
  })

  it("o padrão é 5 minutos; 0 é na hora; o que não for minuto inteiro vira o padrão; no máximo 24 horas", () => {
    expect(minutosDaJanela(null)).toBe(5)
    expect(minutosDaJanela({ janela_da_nota: null })).toBe(5)
    expect(minutosDaJanela({ janela_da_nota: 120 })).toBe(120)
    expect(minutosDaJanela({ janela_da_nota: 0 })).toBe(0)
    expect(minutosDaJanela({ janela_da_nota: 45 })).toBe(45)
    expect(minutosDaJanela({ janela_da_nota: -5 })).toBe(5)
    expect(minutosDaJanela({ janela_da_nota: 1.5 })).toBe(5)
    expect(minutosDaJanela({ janela_da_nota: 5000 })).toBe(1440)
  })
})

const ENDERECO = {
  first_name: "Ana",
  last_name: "Souza",
  phone: "+55 (47) 99988-7766",
  address_1: "Rua XV de Novembro, 100",
  address_2: "Sala 2 — Centro",
  city: "Blumenau",
  province: "sc",
  postal_code: "89010-000",
  metadata: { rua: "Rua XV de Novembro", numero: "100", complemento: "Sala 2", bairro: "Centro" },
}

const PEDIDO: PedidoLido = {
  id: "order_1",
  display_id: 1042,
  status: "pending",
  email: "ana@exemplo.com",
  total: 144.61,
  shipping_total: 19.9,
  items: [
    {
      id: "ordli_1",
      variant_sku: "FBOL01",
      product_title: "Óleo para Barba",
      variant_title: "Único",
      quantity: 2,
      unit_price: 52.7,
    },
    {
      id: "ordli_2",
      variant_sku: "FBBM01",
      product_title: "Balm",
      variant_title: "Cedro",
      quantity: 1,
      unit_price: 39.9,
    },
  ],
  shipping_address: ENDERECO,
  billing_address: {
    ...ENDERECO,
    metadata: { ...ENDERECO.metadata, documento: { tipo: "cpf", valor: "123.456.789-09" } },
  },
  payment_collections: [
    {
      payments: [{ captured_at: "2026-09-24T01:30:00.000Z" }],
      payment_sessions: [
        {
          provider_id: "pp_pagarme_pagarme",
          data: { pagarme: { forma: "cartao", parcelas: 3, situacao: "paga" } },
        },
      ],
    },
  ],
}

describe("o pedido no formato da nota", () => {
  it("com o nome FB-, o dia do pagamento em Brasília e o cliente com CPF", () => {
    const r = montarPedidoParaNota(PEDIDO, AGORA)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.referencia).toBe("FB-1042")
    // 01:30 UTC do dia 24 é 22:30 do dia 23 em Brasília.
    expect(r.pedido.data).toBe("2026-09-23")
    expect(r.pedido.cliente).toEqual({
      nome: "Ana Souza",
      documento: { tipo: "cpf", valor: "12345678909" },
      email: "ana@exemplo.com",
      telefone: "47999887766",
      endereco: {
        cep: "89010000",
        rua: "Rua XV de Novembro",
        numero: "100",
        complemento: "Sala 2",
        bairro: "Centro",
        cidade: "Blumenau",
        uf: "SC",
      },
    })
  })

  it("o desconto é o que fecha a conta com o que a pessoa pagou", () => {
    const r = montarPedidoParaNota(PEDIDO, AGORA)
    if (!r.ok) throw new Error(r.motivo)
    // itens 2×52,70 + 39,90 = 145,30; + frete 19,90 = 165,20; pagou 144,61
    expect(r.pedido.desconto).toBe(20.59)
    expect(r.pedido.itens.map((i) => [i.sku, i.nome, i.quantidade, i.precoUnitario])).toEqual([
      ["FBOL01", "Óleo para Barba", 2, 52.7],
      ["FBBM01", "Balm — Cedro", 1, 39.9],
    ])
  })

  it("a forma de pagamento vem da cobrança do Pagar.me", () => {
    const r = montarPedidoParaNota(PEDIDO, AGORA)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.pagamento).toEqual({ forma: "cartao", parcelas: 3 })
  })

  it("sem CPF/CNPJ, sem SKU ou com a conta que não fecha, não sai — e diz por quê", () => {
    expect(montarPedidoParaNota({ ...PEDIDO, billing_address: ENDERECO }, AGORA)).toEqual({
      ok: false,
      motivo: "o pedido não tem CPF/CNPJ, e a nota precisa",
    })
    expect(
      montarPedidoParaNota({ ...PEDIDO, items: [{ ...PEDIDO.items![0]!, variant_sku: "" }] }, AGORA)
    ).toMatchObject({ ok: false, motivo: expect.stringContaining("não tem SKU") })
    expect(montarPedidoParaNota({ ...PEDIDO, total: 999 }, AGORA)).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("não fecham"),
    })
  })

  it("o CNPJ novo, com letras, vale", () => {
    const r = montarPedidoParaNota(
      {
        ...PEDIDO,
        billing_address: {
          ...ENDERECO,
          metadata: {
            ...ENDERECO.metadata,
            documento: { tipo: "cnpj", valor: "12.ABC.345/01DE-35" },
          },
        },
      },
      AGORA
    )
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.cliente.documento).toEqual({ tipo: "cnpj", valor: "12ABC34501DE35" })
  })

  it("o dia em Brasília", () => {
    expect(diaEmBrasilia(new Date("2026-09-24T02:59:00.000Z"))).toBe("2026-09-23")
    expect(diaEmBrasilia(new Date("2026-09-24T03:00:00.000Z"))).toBe("2026-09-24")
  })
})
