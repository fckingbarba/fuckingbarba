import type { PedidoParaOParceiro } from "../../../lib/envios/parceiro"
import { parceiroQueRegistra } from "../../../lib/envios/parceiros"
import {
  assinaturaDoAviso,
  caixaDoPedido,
  corpoDoPedido,
  lerResposta,
  registraPedidos,
  registrarPedido,
  tirarPedido,
  urlDoAviso,
} from "../pedidos"

const PEDIDO: PedidoParaOParceiro = {
  numero: 1042,
  referencia: "FB-1042",
  criadoEm: "2026-09-23T13:00:00.000Z",
  total: 149.7,
  valorDosProdutos: 129.8,
  frete: 19.9,
  email: "cliente@exemplo.com",
  destinatario: {
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
  },
  itens: [
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
      nome: "Balm",
      quantidade: 1,
      preco: 39.98,
      pesoEmGramas: 80,
      comprimento: 7,
      largura: 7,
      altura: 4,
    },
  ],
  servico: { codigo: "04510", nome: "PAC", transportadora: "Correios" },
  nota: null,
}

const ambiente = { ...process.env }
afterEach(() => {
  process.env = { ...ambiente }
  jest.restoreAllMocks()
})

describe("o pedido no formato da Frenet", () => {
  it("vai com o nome da loja (FB-), o remetente da conta e o serviço da cotação", () => {
    const [envio] = corpoDoPedido(PEDIDO)
    expect(envio.Order.Id).toBe("FB-1042")
    expect(envio.Order.UseFrenetRegistration).toBe(true)
    expect(envio.Order.Value).toBe(149.7)
    expect(envio.Order).not.toHaveProperty("From")
    expect(envio.Quotation).toEqual({
      ShippingServiceCode: "04510",
      ShippingServiceName: "PAC",
      Carrier: "Correios",
      PlatformShippingPrice: 19.9,
    })
    expect(envio).not.toHaveProperty("TrackingNotificationUrl")
  })

  it("o destinatário com as partes do endereço, e o celular nos dois campos", () => {
    const { To } = corpoDoPedido(PEDIDO)[0].Order
    expect(To).toEqual({
      Name: "Ana Souza",
      Email: "cliente@exemplo.com",
      Phone: "11912345678",
      Cellphone: "11912345678",
      Document: "12345678909",
      Address: {
        ZipCode: "01310100",
        City: "São Paulo",
        Street: "Avenida Paulista",
        AddressNumber: "1000",
        AddressComplement: "Apto 12",
        AddressQuarter: "Bela Vista",
        AddressState: "SP",
        Country: "BR",
      },
    })
  })

  it("telefone fixo não vira celular, e o que falta não vai", () => {
    const { To } = corpoDoPedido({
      ...PEDIDO,
      email: null,
      destinatario: {
        ...PEDIDO.destinatario,
        telefone: "1133334444",
        documento: null,
        endereco: { ...PEDIDO.destinatario.endereco, complemento: null },
      },
    })[0].Order
    expect(To.Phone).toBe("1133334444")
    expect(To).not.toHaveProperty("Cellphone")
    expect(To).not.toHaveProperty("Email")
    expect(To).not.toHaveProperty("Document")
    expect(To.Address).not.toHaveProperty("AddressComplement")
  })

  it("os itens em quilo, com o id da linha, e sem inventar medida que não existe", () => {
    const itens = corpoDoPedido({
      ...PEDIDO,
      itens: [{ ...PEDIDO.itens[1]!, pesoEmGramas: 0, comprimento: 0 }],
    })[0].Order.Items
    expect(itens[0]).toEqual({
      OrderId: "FB-1042",
      ItemId: "ordli_2",
      ProductId: "prod_balm",
      ProductName: "Balm",
      Quantity: 1,
      Price: 39.98,
      Width: 7,
      Height: 4,
    })
    expect(corpoDoPedido(PEDIDO)[0].Order.Items[0]).toMatchObject({ Weight: 0.12, SKU: "OLEO-30" })
  })

  it("sem nota, vai sem; com a nota autorizada, ela vai no pedido (a etiqueta sai sem digitar)", () => {
    expect(corpoDoPedido(PEDIDO)[0].Order).not.toHaveProperty("Invoice")
    const comNota = corpoDoPedido({
      ...PEDIDO,
      nota: {
        numero: "1234",
        serie: "1",
        chave: "42260912345678000199550010000012341000012345",
        valor: 149.7,
        emitidaEm: "2026-09-23T13:05:00.000Z",
      },
    })[0].Order
    expect(comNota.Invoice).toEqual({
      Number: "1234",
      Series: "1",
      Key: "42260912345678000199550010000012341000012345",
      Value: 149.7,
      Date: "2026-09-23T13:05:00.000Z",
    })
  })

  it("com o endereço do aviso, ele vai no envio", () => {
    const [envio] = corpoDoPedido(PEDIDO, {
      aviso: "https://api.exemplo.com/hooks/envio/frenet?x=1",
    })
    expect(envio.TrackingNotificationUrl).toBe("https://api.exemplo.com/hooks/envio/frenet?x=1")
  })

  it("sem serviço guardado (a cotação caiu), vai sem a cotação — quem despacha escolhe", () => {
    expect(corpoDoPedido({ ...PEDIDO, servico: null })[0]).not.toHaveProperty("Quotation")
  })
})

describe("a caixa", () => {
  it("empilha: o maior comprimento, a maior largura, a soma das alturas, o peso de tudo", () => {
    expect(caixaDoPedido(PEDIDO.itens)).toEqual({ Weight: 0.32, Length: 16, Width: 11, Height: 28 })
  })

  it("nunca menor que o mínimo dos Correios, e sem peso quando o cadastro não tem", () => {
    expect(
      caixaDoPedido([{ ...PEDIDO.itens[1]!, pesoEmGramas: 0, altura: 1, quantidade: 1 }])
    ).toEqual({ Length: 16, Width: 11, Height: 2 })
  })

  it("vai no volume — um objeto, e não lista (o #19) — com o valor declarado e as linhas dentro dela", () => {
    expect(corpoDoPedido(PEDIDO)[0].Volumes).toEqual({
      Weight: 0.32,
      Length: 16,
      Width: 11,
      Height: 28,
      Price: 129.8,
      DeclaredValue: 129.8,
      OrderItemsId: ["ordli_1", "ordli_2"],
    })
  })
})

describe("o endereço do aviso de cada pedido", () => {
  it("é o da API, com o pedido e a assinatura presa a ele", () => {
    process.env.MEDUSA_BACKEND_URL = "https://api.exemplo.com/"
    process.env.FRENET_WEBHOOK_TOKEN = "segredo"
    const url = new URL(urlDoAviso("FB-1042")!)
    expect(`${url.origin}${url.pathname}`).toBe("https://api.exemplo.com/hooks/envio/frenet")
    expect(url.searchParams.get("pedido")).toBe("FB-1042")
    expect(url.searchParams.get("assinatura")).toBe(assinaturaDoAviso("FB-1042", "segredo"))
    expect(url.searchParams.has("chave")).toBe(false)
    expect(url.toString()).not.toContain("segredo")
  })

  it("a assinatura muda com o pedido e com a chave", () => {
    const a = assinaturaDoAviso("FB-1042", "segredo")
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(assinaturaDoAviso("FB-1043", "segredo")).not.toBe(a)
    expect(assinaturaDoAviso("FB-1042", "outra")).not.toBe(a)
  })

  it("sem o endereço público da API, ou sem a chave, não há endereço", () => {
    process.env.FRENET_WEBHOOK_TOKEN = "segredo"
    delete process.env.MEDUSA_BACKEND_URL
    expect(urlDoAviso("FB-1042")).toBeNull()
    process.env.MEDUSA_BACKEND_URL = "api.exemplo.com"
    expect(urlDoAviso("FB-1042")).toBeNull()
    process.env.MEDUSA_BACKEND_URL = "https://api.exemplo.com"
    delete process.env.FRENET_WEBHOOK_TOKEN
    expect(urlDoAviso("FB-1042")).toBeNull()
  })
})

describe("a resposta da Frenet", () => {
  const lote = (item: Record<string, unknown>, status = "Processado") => ({
    StatusBatch: status,
    Items: [{ OrderId: "FB-1042", ...item }],
  })

  it("com o id do envio, entrou", () => {
    expect(lerResposta(200, lote({ ShipmentId: 21255, ShipmentStatus: 1 }), "FB-1042")).toEqual({
      ok: true,
      idNoParceiro: "21255",
    })
  })

  it("erro no item é recusa definitiva, com o motivo deles", () => {
    expect(
      lerResposta(200, lote({ Errors: [{ Code: 12, Message: "CEP inválido" }] }, "Erro"), "FB-1042")
    ).toEqual({ ok: false, motivo: "a Frenet recusou o pedido: CEP inválido", definitivo: true })
  })

  it("400 é recusa definitiva; 401/403, 5xx e resposta sem id, não", () => {
    const erro = { Message: "Requisição inválida", Details: [{ Code: 1, Message: "To.Name" }] }
    expect(lerResposta(400, erro, "FB-1042")).toEqual({
      ok: false,
      motivo: "a Frenet recusou o pedido: Requisição inválida — To.Name",
      definitivo: true,
    })
    expect(lerResposta(401, null, "FB-1042")).toMatchObject({ ok: false, definitivo: false })
    expect(lerResposta(403, null, "FB-1042")).toMatchObject({ ok: false, definitivo: false })
    expect(lerResposta(502, null, "FB-1042")).toMatchObject({ ok: false, definitivo: false })
    expect(lerResposta(200, lote({ ShipmentId: 0 }), "FB-1042")).toMatchObject({
      ok: false,
      definitivo: false,
    })
  })

  it("lê a resposta em camelCase, como a documentação mostra (senão o que entrou iria de novo)", () => {
    expect(
      lerResposta(
        200,
        {
          statusBatch: "Processado",
          items: [{ shipmentId: 12682, orderId: "FB-1042", shipmentStatus: 1, errors: null }],
        },
        "FB-1042"
      )
    ).toEqual({ ok: true, idNoParceiro: "12682" })
    expect(
      lerResposta(
        200,
        {
          statusBatch: "Erro",
          items: [{ orderId: "FB-1042", errors: [{ code: 2011, message: "Rua inválida" }] }],
        },
        "FB-1042"
      )
    ).toEqual({ ok: false, motivo: "a Frenet recusou o pedido: Rua inválida", definitivo: true })
  })

  it("o 400 da validação do ASP.NET diz o campo, em vez de 'sem motivo' (o #19)", () => {
    const validacao = {
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      errors: { "$[0].Volumes": ["The JSON value could not be converted to Volume."] },
    }
    const r = lerResposta(400, validacao, "FB-1042")
    expect(r).toMatchObject({ ok: false, definitivo: true })
    expect(!r.ok && r.motivo).toBe(
      "a Frenet recusou o pedido: One or more validation errors occurred. — $[0].Volumes: The JSON value could not be converted to Volume."
    )
    // Fora de qualquer forma conhecida, vale o começo da resposta crua.
    expect(lerResposta(400, null, "FB-1042", "Bad Request: Volumes inválido")).toEqual({
      ok: false,
      motivo: "a Frenet recusou o pedido: Bad Request: Volumes inválido",
      definitivo: true,
    })
    expect(lerResposta(400, null, "FB-1042", "")).toEqual({
      ok: false,
      motivo: "a Frenet recusou o pedido: sem motivo na resposta",
      definitivo: true,
    })
  })
})

describe("ligado só com os dois tokens", () => {
  it("sem o de parceiro, desligado — e nenhum parceiro registra", async () => {
    process.env.FRENET_TOKEN = "loja"
    delete process.env.FRENET_PARCEIRO_TOKEN
    const chamada = jest.spyOn(global, "fetch")
    expect(registraPedidos()).toBe(false)
    expect(parceiroQueRegistra()).toBeNull()
    expect(await registrarPedido(PEDIDO)).toMatchObject({ ok: false, definitivo: false })
    expect(await tirarPedido("21255")).toMatchObject({ ok: false })
    expect(chamada).not.toHaveBeenCalled()
  })

  it("com os dois, a Frenet é quem registra", () => {
    process.env.FRENET_TOKEN = "loja"
    process.env.FRENET_PARCEIRO_TOKEN = "parceiro"
    expect(registraPedidos()).toBe(true)
    expect(parceiroQueRegistra()?.id).toBe("frenet")
  })
})

describe("as chamadas", () => {
  const resposta = (status: number, corpo?: unknown) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status })

  beforeEach(() => {
    process.env.FRENET_TOKEN = "loja"
    process.env.FRENET_PARCEIRO_TOKEN = "parceiro"
    process.env.FRENET_WHITELABEL_URL = "http://127.0.0.1:4310"
  })

  it("o pedido vai com os dois tokens, pro endereço configurado", async () => {
    const chamada = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        resposta(200, { StatusBatch: "Processado", Items: [{ OrderId: "FB-1042", ShipmentId: 7 }] })
      )
    expect(await registrarPedido(PEDIDO)).toEqual({ ok: true, idNoParceiro: "7" })
    const [url, init] = chamada.mock.calls[0]!
    expect(url).toBe("http://127.0.0.1:4310/v1/orders")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toMatchObject({ token: "loja", "x-partner-token": "parceiro" })
    expect(JSON.parse(String(init?.body))[0].Order.Id).toBe("FB-1042")
  })

  it("e leva o endereço do aviso, quando a API tem endereço público", async () => {
    process.env.MEDUSA_BACKEND_URL = "https://api.exemplo.com"
    process.env.FRENET_WEBHOOK_TOKEN = "segredo"
    const chamada = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        resposta(200, { StatusBatch: "Processado", Items: [{ OrderId: "FB-1042", ShipmentId: 8 }] })
      )
    await registrarPedido(PEDIDO)
    const [envio] = JSON.parse(String(chamada.mock.calls[0]![1]?.body))
    expect(envio.TrackingNotificationUrl).toBe(urlDoAviso("FB-1042"))
  })

  it("a Frenet fora do ar não é recusa", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"))
    expect(await registrarPedido(PEDIDO)).toMatchObject({ ok: false, definitivo: false })
  })

  it("tirar: cancela primeiro; se não cancelar, apaga", async () => {
    const chamada = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(resposta(400, { Message: "Envio sem etiqueta" }))
      .mockResolvedValueOnce(resposta(204))
    expect(await tirarPedido("21255")).toEqual({ ok: true })
    expect(chamada.mock.calls.map(([u, i]) => `${i?.method} ${u}`)).toEqual([
      "POST http://127.0.0.1:4310/v1/shipments/21255/cancel",
      "DELETE http://127.0.0.1:4310/v1/shipments/21255",
    ])
  })

  it("tirar: se nenhum dos dois der, diz os dois porquês", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(resposta(400, { Message: "Objeto já postado" }))
      .mockResolvedValueOnce(resposta(400, { Message: "Objeto já postado" }))
    expect(await tirarPedido("21255")).toEqual({
      ok: false,
      motivo: "cancelar: 400 (Objeto já postado); apagar: 400 (Objeto já postado)",
    })
  })
})
