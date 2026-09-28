import {
  CHAVE_NO_PEDIDO,
  decidirRegistro,
  esperaDepoisDe,
  lerRegistroNoPedido,
  montarPedido,
  paraTirarDeNovo,
  registroAtrasado,
  type PedidoLido,
  type RegistroNoPedido,
} from "../registro"

const AGORA = new Date("2026-09-23T15:00:00.000Z")
const DESDE = new Date("2026-09-23T12:00:00.000Z")
const MINUTO = 60 * 1000

const PEDIDO: PedidoLido = {
  id: "order_1",
  display_id: 1042,
  email: "cliente@exemplo.com",
  status: "pending",
  created_at: "2026-09-23T13:00:00.000Z",
  metadata: {},
  total: 149.7,
  item_total: 129.8,
  shipping_total: 19.9,
  items: [
    {
      id: "ordli_1",
      title: "Único",
      product_title: "Óleo para barba",
      variant_title: "Único",
      product_id: "prod_oleo",
      variant_sku: "OLEO-30",
      quantity: 2,
      unit_price: 49.9,
      total: 89.82,
      variant: { weight: 120, length: 5, width: 5, height: 12 },
    },
    {
      id: "ordli_2",
      title: "Cedro",
      product_title: "Balm",
      variant_title: "Cedro",
      product_id: "prod_balm",
      variant_sku: null,
      quantity: 1,
      unit_price: 39.98,
      total: 39.98,
      variant: null,
    },
  ],
  shipping_address: {
    first_name: "Ana",
    last_name: "Souza",
    phone: "+55 (11) 91234-5678",
    address_1: "Avenida Paulista, 1000",
    address_2: "Apto 12 — Bela Vista",
    city: "São Paulo",
    province: "sp",
    postal_code: "01310-100",
    metadata: {
      rua: "Avenida Paulista",
      numero: "1000",
      complemento: "Apto 12",
      bairro: "Bela Vista",
    },
  },
  billing_address: { metadata: { documento: { tipo: "cpf", valor: "12345678909" } } },
  shipping_methods: [
    { data: { servico: { codigo: "04510", nome: "PAC", transportadora: "Correios" } } },
  ],
  payment_collections: [{ payments: [{ captured_at: "2026-09-23T13:01:00.000Z" }] }],
  fulfillments: [],
}

const registro = (r: Partial<RegistroNoPedido>): PedidoLido["metadata"] => ({
  [CHAVE_NO_PEDIDO]: {
    parceiro: "frenet",
    referencia: "FB-1042",
    entrou: false,
    id: null,
    em: AGORA.toISOString(),
    tentativas: 1,
    ...r,
  },
})

const decidir = (o: Partial<PedidoLido>, agora = AGORA) =>
  decidirRegistro({ ...PEDIDO, ...o }, { desde: DESDE, agora })

describe("quais pedidos vão pro painel", () => {
  it("o pago depois de o registro ligar, sem envio, vai", () => {
    expect(decidir({})).toEqual({ registrar: true })
  })

  it("o que já entrou, o cancelado e o não pago, não", () => {
    expect(decidir({ metadata: registro({ entrou: true, id: "7" }) })).toMatchObject({
      motivo: "ja-entrou",
    })
    expect(decidir({ status: "canceled" })).toMatchObject({ motivo: "cancelado" })
    expect(decidir({ payment_collections: [{ payments: [{ captured_at: null }] }] })).toMatchObject(
      {
        motivo: "nao-pago",
      }
    )
  })

  it("o pago ANTES de o registro ligar fica com a etiqueta feita à mão", () => {
    expect(
      decidir({
        payment_collections: [{ payments: [{ captured_at: "2026-09-23T11:59:00.000Z" }] }],
      })
    ).toMatchObject({ registrar: false, motivo: "pago-antes" })
  })

  it("com envio criado no admin — postado ou não —, alguém já está cuidando", () => {
    expect(decidir({ fulfillments: [{ canceled_at: null }] })).toMatchObject({
      motivo: "ja-tem-envio",
    })
    expect(decidir({ fulfillments: [{ canceled_at: "2026-09-23T14:00:00.000Z" }] })).toEqual({
      registrar: true,
    })
  })

  it("recusado pelo parceiro, não insiste — só o botão 'Mandar pra Frenet de novo' passa", () => {
    const recusado = { ...PEDIDO, metadata: registro({ definitivo: true, erro: "CEP" }) }
    expect(decidirRegistro(recusado, { desde: DESDE, agora: AGORA })).toMatchObject({
      motivo: "recusado",
    })
    expect(decidirRegistro(recusado, { desde: DESDE, agora: AGORA, deNovo: true })).toEqual({
      registrar: true,
    })
    // O de novo não passa por cima do resto: cancelado, com envio no admin, esperando a nota.
    expect(
      decidirRegistro(
        { ...recusado, fulfillments: [{ canceled_at: null }] },
        { desde: DESDE, agora: AGORA, deNovo: true }
      )
    ).toMatchObject({ motivo: "ja-tem-envio" })
    expect(
      decidirRegistro(
        { ...recusado, status: "canceled" },
        { desde: DESDE, agora: AGORA, deNovo: true }
      )
    ).toMatchObject({ motivo: "cancelado" })
  })

  it("depois de uma falha, espera cada vez mais antes de tentar de novo", () => {
    expect(esperaDepoisDe(1)).toBe(10 * MINUTO)
    expect(esperaDepoisDe(2)).toBe(20 * MINUTO)
    expect(esperaDepoisDe(4)).toBe(80 * MINUTO)
    expect(esperaDepoisDe(20)).toBe(6 * 60 * MINUTO)

    const falhou = registro({
      tentativas: 2,
      em: new Date(AGORA.getTime() - 15 * MINUTO).toISOString(),
    })
    expect(decidir({ metadata: falhou })).toMatchObject({ motivo: "esperando" })
    expect(decidir({ metadata: falhou }, new Date(AGORA.getTime() + 5 * MINUTO))).toEqual({
      registrar: true,
    })
  })

  it("registro ilegível é como não ter registro", () => {
    expect(lerRegistroNoPedido({ [CHAVE_NO_PEDIDO]: { parceiro: "frenet" } })).toBeNull()
    expect(lerRegistroNoPedido(null)).toBeNull()
    expect(decidir({ metadata: { [CHAVE_NO_PEDIDO]: "lixo" } })).toEqual({ registrar: true })
  })
})

describe("o pedido que passou dos três dias tentando", () => {
  const DIA = 24 * 60 * MINUTO
  // Pago em 23/09 às 13:01 (o PEDIDO): três dias e quase duas horas depois.
  const DEPOIS = new Date(AGORA.getTime() + 3 * DIA)
  const tentando = registro({ erro: "a Frenet não respondeu (502)" })
  const atrasado = (o: Partial<PedidoLido>, agora = DEPOIS) =>
    registroAtrasado({ ...PEDIDO, metadata: tentando, ...o }, agora)

  it("não entrou e a loja ainda tentava: passou dos três dias, para", () => {
    expect(atrasado({})).toBe(true)
  })

  it("dentro dos três dias, a varredura segue tentando", () => {
    expect(atrasado({}, new Date(AGORA.getTime() + 2 * DIA))).toBe(false)
  })

  it("um pagamento ainda nos três dias segura o pedido", () => {
    expect(
      atrasado({
        payment_collections: [
          { payments: [{ captured_at: "2026-09-23T13:01:00.000Z" }] },
          { payments: [{ captured_at: "2026-09-25T13:01:00.000Z" }] },
        ],
      })
    ).toBe(false)
  })

  it("o que entrou, o recusado de vez, o sem registro, o cancelado e o com envio no admin, não", () => {
    expect(atrasado({ metadata: registro({ entrou: true, id: "7" }) })).toBe(false)
    expect(atrasado({ metadata: registro({ definitivo: true, erro: "CEP" }) })).toBe(false)
    expect(atrasado({ metadata: {} })).toBe(false)
    expect(atrasado({ status: "canceled" })).toBe(false)
    expect(atrasado({ fulfillments: [{ canceled_at: null }] })).toBe(false)
  })

  it("o que a loja parou é recusado pra varredura — só o 'Mandar de novo' passa", () => {
    const parou = {
      ...PEDIDO,
      metadata: registro({
        erro: "a Frenet não respondeu (502)",
        definitivo: true,
        desistiu_em: DEPOIS.toISOString(),
      }),
    }
    expect(registroAtrasado(parou, DEPOIS)).toBe(false)
    expect(decidirRegistro(parou, { desde: DESDE, agora: DEPOIS })).toMatchObject({
      motivo: "recusado",
    })
    expect(decidirRegistro(parou, { desde: DESDE, agora: DEPOIS, deNovo: true })).toEqual({
      registrar: true,
    })
  })
})

describe("o cancelado que ficou no painel", () => {
  it("entrou e não saiu: tenta tirar — o do evento perdido, na primeira rodada", () => {
    expect(paraTirarDeNovo(registro({ entrou: true, id: "7" }), AGORA)).toBe(true)
  })

  it("depois de uma falha, a mesma espera do registro", () => {
    const falhou = registro({
      entrou: true,
      id: "7",
      erro_ao_tirar: "cancelar: 500; apagar: 500",
      tentativas_ao_tirar: 2,
      tentou_tirar_em: new Date(AGORA.getTime() - 15 * MINUTO).toISOString(),
    })
    expect(paraTirarDeNovo(falhou, AGORA)).toBe(false)
    expect(paraTirarDeNovo(falhou, new Date(AGORA.getTime() + 5 * MINUTO))).toBe(true)
  })

  it("o que saiu, o que nem entrou e o sem id, não", () => {
    expect(paraTirarDeNovo(registro({ entrou: true, id: "7", tirado_em: "x" }), AGORA)).toBe(false)
    expect(paraTirarDeNovo(registro({ entrou: false }), AGORA)).toBe(false)
    expect(paraTirarDeNovo(registro({ entrou: true, id: null }), AGORA)).toBe(false)
    expect(paraTirarDeNovo({}, AGORA)).toBe(false)
  })
})

describe("o pedido no formato do contrato", () => {
  it("com o nome do pedido no parceiro, os totais e o serviço da cotação", () => {
    const r = montarPedido(PEDIDO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pedido).toMatchObject({
      numero: 1042,
      referencia: "FB-1042",
      criadoEm: "2026-09-23T13:00:00.000Z",
      total: 149.7,
      valorDosProdutos: 129.8,
      frete: 19.9,
      email: "cliente@exemplo.com",
      servico: { codigo: "04510", nome: "PAC", transportadora: "Correios" },
    })
  })

  it("o destinatário: telefone sem o 55, documento do endereço de cobrança, UF maiúscula", () => {
    const r = montarPedido(PEDIDO)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.destinatario).toEqual({
      nome: "Ana Souza",
      documento: "12345678909",
      telefone: "11912345678",
      endereco: {
        cep: "01310100",
        rua: "Avenida Paulista",
        numero: "1000",
        complemento: "Apto 12",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        uf: "SP",
      },
    })
  })

  it("sem as partes no metadata, lê as linhas montadas pelo checkout", () => {
    const r = montarPedido({
      ...PEDIDO,
      shipping_address: { ...PEDIDO.shipping_address, metadata: null },
    })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.destinatario.endereco).toMatchObject({
      rua: "Avenida Paulista",
      numero: "1000",
      complemento: "Apto 12",
      bairro: "Bela Vista",
    })

    const soBairro = montarPedido({
      ...PEDIDO,
      shipping_address: {
        ...PEDIDO.shipping_address,
        address_1: "Rua Sem Número",
        address_2: "Centro",
        metadata: null,
      },
    })
    if (!soBairro.ok) throw new Error(soBairro.motivo)
    expect(soBairro.pedido.destinatario.endereco).toMatchObject({
      rua: "Rua Sem Número",
      numero: "S/N",
      complemento: null,
      bairro: "Centro",
    })
  })

  it("o CNPJ novo, com letras, passa; documento torto não", () => {
    const comCnpj = (valor: string) =>
      montarPedido({
        ...PEDIDO,
        billing_address: { metadata: { documento: { tipo: "cnpj", valor } } },
      })
    const r = comCnpj("12.ABC.345/01DE-35")
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.destinatario.documento).toBe("12ABC34501DE35")
    const torto = comCnpj("123")
    if (!torto.ok) throw new Error(torto.motivo)
    expect(torto.pedido.destinatario.documento).toBeNull()
  })

  it("os itens: o preço pago na unidade, o nome com a variante, e zero no que o cadastro não tem", () => {
    const r = montarPedido(PEDIDO)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.itens).toEqual([
      {
        id: "ordli_1",
        produtoId: "prod_oleo",
        sku: "OLEO-30",
        nome: "Óleo para barba",
        quantidade: 2,
        preco: 44.91,
        pesoEmGramas: 120,
        comprimento: 5,
        largura: 5,
        altura: 12,
      },
      {
        id: "ordli_2",
        produtoId: "prod_balm",
        sku: null,
        nome: "Balm — Cedro",
        quantidade: 1,
        preco: 39.98,
        pesoEmGramas: 0,
        comprimento: 0,
        largura: 0,
        altura: 0,
      },
    ])
  })

  it("endereço sem o que a etiqueta precisa não vai — e diz o que falta", () => {
    expect(
      montarPedido({
        ...PEDIDO,
        shipping_address: {
          ...PEDIDO.shipping_address,
          postal_code: "0131",
          metadata: { ...PEDIDO.shipping_address!.metadata, bairro: "" },
          address_2: "",
        },
      })
    ).toEqual({ ok: false, motivo: "endereço incompleto (falta CEP, bairro)" })
    expect(montarPedido({ ...PEDIDO, shipping_address: null })).toMatchObject({ ok: false })
    expect(montarPedido({ ...PEDIDO, items: [] })).toEqual({
      ok: false,
      motivo: "pedido sem itens",
    })
  })

  it("sem serviço guardado, vai sem — quem despacha escolhe no painel", () => {
    const r = montarPedido({ ...PEDIDO, shipping_methods: [{ data: {} }] })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.pedido.servico).toBeNull()
  })
})
