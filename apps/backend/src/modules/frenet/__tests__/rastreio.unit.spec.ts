import type { Chegada } from "../../../lib/envios/parceiro"
import { frenet, lerHoraDaFrenet, traduzirAviso } from "../rastreio"

const AVISO = {
  OrderId: "1042",
  ShipmentId: 21255,
  TrackingUrl: "https://rastreio.frenet.com.br/COR/QS123456789BR",
  TrackingNumber: "QS123456789BR",
  ServiceDescrition: "PAC",
  TrackingEvents: [
    {
      EventDateTime: "10/02/2017 16:48",
      EventDescription: "Objeto entregue ao destinatário",
      EventLocation: "Boa Nova-BA",
      EventType: "9",
    },
  ],
}

const chegada = (extra: Partial<Chegada> = {}): Chegada => ({
  cabecalhos: { "x-webhook-token": "segredo" },
  consulta: {},
  corpo: AVISO,
  bruto: JSON.stringify(AVISO),
  ...extra,
})

const original = process.env.FRENET_WEBHOOK_TOKEN
beforeEach(() => {
  process.env.FRENET_WEBHOOK_TOKEN = "segredo"
})
afterAll(() => {
  if (original === undefined) delete process.env.FRENET_WEBHOOK_TOKEN
  else process.env.FRENET_WEBHOOK_TOKEN = original
})

describe("a hora da Frenet", () => {
  it("é a de Brasília, sem fuso escrito", () => {
    expect(lerHoraDaFrenet("10/02/2017 16:48")?.toISOString()).toBe("2017-02-10T19:48:00.000Z")
    expect(lerHoraDaFrenet("10/02/2017 16:48:30")?.toISOString()).toBe("2017-02-10T19:48:30.000Z")
    expect(lerHoraDaFrenet("2017-02-10T16:48:00-03:00")?.toISOString()).toBe(
      "2017-02-10T19:48:00.000Z"
    )
    expect(lerHoraDaFrenet("ontem")).toBeNull()
    expect(lerHoraDaFrenet(undefined)).toBeNull()
  })
})

describe("o aviso de rastreio, traduzido", () => {
  it("traz o pedido, o envio, o código, o link e o serviço (com o nome torto deles)", () => {
    const n = traduzirAviso(AVISO)!
    expect(n).toMatchObject({
      pedido: "1042",
      idNoParceiro: "21255",
      codigo: "QS123456789BR",
      url: "https://rastreio.frenet.com.br/COR/QS123456789BR",
      servico: "PAC",
    })
    expect(n.eventos).toHaveLength(1)
    expect(n.eventos[0]).toMatchObject({
      tipo: "entregue",
      descricao: "Objeto entregue ao destinatário",
      local: "Boa Nova-BA",
    })
    expect(n.eventos[0]!.quando.toISOString()).toBe("2017-02-10T19:48:00.000Z")
  })

  it("cada código da documentação vira uma palavra do núcleo", () => {
    const tipo = (codigo: string | number) =>
      traduzirAviso({
        ...AVISO,
        TrackingEvents: [{ ...AVISO.TrackingEvents[0], EventType: codigo }],
      })!.eventos[0]!.tipo
    expect(tipo("18")).toBe("postado")
    expect(tipo("0")).toBe("postado")
    expect(tipo(1)).toBe("em_transito")
    expect(tipo("2")).toBe("atrasado")
    expect(tipo("3")).toBe("devolvido")
    expect(tipo("4")).toBe("extraviado")
    expect(tipo("5")).toBe("saiu_para_entrega")
    expect(tipo("9")).toBe("entregue")
    expect(tipo("77")).toBe("informativo")
  })

  it("evento sem descrição ganha o texto da documentação", () => {
    const n = traduzirAviso({
      ...AVISO,
      TrackingEvents: [{ EventType: "5", EventDateTime: "10/02/2017 08:00" }],
    })!
    expect(n.eventos[0]!.descricao).toBe("Saiu para entrega")
  })
})

describe("quem pode avisar", () => {
  it("sem a variável, ninguém — a porta falha fechada", () => {
    delete process.env.FRENET_WEBHOOK_TOKEN
    expect(frenet.lerAviso(chegada())).toMatchObject({ ok: false, motivo: "sem-configuracao" })
  })

  it("com o token errado, ou sem ele, não", () => {
    expect(frenet.lerAviso(chegada({ cabecalhos: { "x-webhook-token": "chute" } }))).toMatchObject({
      ok: false,
      motivo: "nao-autorizado",
    })
    expect(frenet.lerAviso(chegada({ cabecalhos: {} }))).toMatchObject({
      ok: false,
      motivo: "nao-autorizado",
    })
  })

  it("com o token no cabeçalho (qualquer caixa) ou na `?chave=`, sim", () => {
    expect(frenet.lerAviso(chegada()).ok).toBe(true)
    expect(frenet.lerAviso(chegada({ cabecalhos: { "X-Webhook-Token": "segredo" } })).ok).toBe(true)
    expect(frenet.lerAviso(chegada({ cabecalhos: {}, consulta: { chave: "segredo" } })).ok).toBe(
      true
    )
  })

  it("o aviso de status da carteira é ignorado; o que não é da Frenet, ilegível", () => {
    const status = { OrderId: "1", ShipmentId: 1, ShipmentStatus: 5, Balance: 50.5 }
    expect(frenet.lerAviso(chegada({ corpo: status }))).toMatchObject({
      ok: false,
      motivo: "ignorado",
    })
    expect(frenet.lerAviso(chegada({ corpo: { foo: 1 } }))).toMatchObject({
      ok: false,
      motivo: "ilegivel",
    })
  })

  it("lista de avisos num corpo só vira uma novidade por aviso", () => {
    const r = frenet.lerAviso(
      chegada({ corpo: [AVISO, { ...AVISO, TrackingNumber: "QS000000000BR" }] })
    )
    expect(r.ok && r.novidades.map((n) => n.codigo)).toEqual(["QS123456789BR", "QS000000000BR"])
  })
})
