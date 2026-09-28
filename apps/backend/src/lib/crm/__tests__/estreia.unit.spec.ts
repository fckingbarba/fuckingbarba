import {
  comecoDoLote,
  filaDaEstreia,
  fimDaEstreia,
  loteDaPosicao,
  oQueAcaba,
  segmentoDaEstreia,
  type SegmentoDaEstreia,
} from "../estreia"
import { DIAS_PADRAO, etiquetasDaPessoa, skuAvulso, type PedidoDaPessoa } from "../etiquetas"
import { CHAVE_DOS_FLUXOS, decidir, FLUXOS, lerConfigDosFluxos } from "../fluxos"

/**
 * A estreia da loja nova (0181): o jeito do e-mail de cada pessoa da base, a
 * fila, os lotes e a hora de cada um — e o fluxo no motor, desligado até o
 * dono ligar, com o grupo de controle.
 */

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date("2026-09-28T15:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)

/** Um Fator (30 dias no padrão), pago há `dias`: a entrega estimada é 7 dias depois. */
const fator = (dias: number): PedidoDaPessoa => ({
  id: `nuvemshop:${dias}`,
  numero: String(dias),
  pagoEm: haDias(dias),
  entregueEm: null,
  cancelado: false,
  itens: [{ handle: null, sku: "FBFCB01", nome: "Fator de Crescimento", quantidade: 1 }],
  cupons: [],
})
const etiquetas = (pedidos: PedidoDaPessoa[]) =>
  etiquetasDaPessoa({
    pedidos,
    sinais: { ultimoClique: null, ultimaVisita: null, newsletterDesde: null },
    agora: AGORA,
  })

describe("o jeito do e-mail de cada um", () => {
  it("nunca comprou: o da 1ª compra", () => {
    expect(segmentoDaEstreia(null, AGORA)).toBe("lead")
    expect(segmentoDaEstreia(etiquetas([]), AGORA)).toBe("lead")
  })

  it("o Fator acaba em até 14 dias, ou acabou há pouco: na hora de repor", () => {
    // Pago há 30 dias: entregue no 7º, acaba no 37º — daqui a 7 dias.
    expect(segmentoDaEstreia(etiquetas([fator(30)]), AGORA)).toBe("repor")
    // Acabou há 13 dias: ainda não passou a tolerância de 20.
    expect(segmentoDaEstreia(etiquetas([fator(50)]), AGORA)).toBe("repor")
  })

  it("no meio do tratamento: o da loja nova; passou da tolerância: quem sumiu", () => {
    expect(segmentoDaEstreia(etiquetas([fator(10)]), AGORA)).toBe("cliente")
    expect(segmentoDaEstreia(etiquetas([fator(70)]), AGORA)).toBe("sumido")
    expect(segmentoDaEstreia(etiquetas([fator(200)]), AGORA)).toBe("sumido")
  })
})

describe("o botão do e-mail de repor", () => {
  const pedido = (itens: [string, number?][]): PedidoDaPessoa => ({
    id: "nuvemshop:1",
    numero: "1",
    pagoEm: haDias(40),
    entregueEm: null,
    cancelado: false,
    itens: itens.map(([sku, quantidade = 1]) => ({ handle: null, sku, nome: sku, quantidade })),
    cupons: [],
  })

  it("veio avulso: o próprio item (a pasta brilho continua brilho)", () => {
    expect(oQueAcaba(pedido([["FBFCB01"]]), DIAS_PADRAO)).toEqual({
      componente: "fator",
      sku: "FBFCB01",
    })
    expect(oQueAcaba(pedido([["FBFCB01", 2]]), DIAS_PADRAO)?.sku).toBe("FBFCB01")
    expect(oQueAcaba(pedido([["FBPBR01"]]), DIAS_PADRAO)).toEqual({
      componente: "pasta",
      sku: "FBPBR01",
    })
  })

  it("veio num kit ou em pacote: o avulso do que acaba primeiro", () => {
    // O Kit Completo, com os dias da Nuvemshop: o óleo (70) acaba antes do shampoo (78) e do balm (81).
    expect(
      oQueAcaba(pedido([["FBKIT01"]]), { ...DIAS_PADRAO, oleo: 70, shampoo: 78, balm: 81 })
    ).toEqual({ componente: "oleo", sku: "FBOL01" })
    // O de 3 Fatores e o Fator com Shampoo: o Fator avulso.
    expect(oQueAcaba(pedido([["FBKIT06"]]), DIAS_PADRAO)?.sku).toBe("FBFCB01")
    expect(oQueAcaba(pedido([["FBKIT08"]]), DIAS_PADRAO)).toEqual({
      componente: "fator",
      sku: "FBFCB01",
    })
    expect([skuAvulso("pasta"), skuAvulso("balm"), skuAvulso("spray")]).toEqual([
      "FBPMT01",
      "FBBM01",
      "FBMSP01",
    ])
  })
})

describe("a fila e os lotes", () => {
  it("na hora de repor primeiro, depois o tratamento, quem sumiu e quem nunca comprou", () => {
    const p = (email: string, segmento: SegmentoDaEstreia, dias: number | null) => ({
      email,
      segmento,
      recente: dias === null ? null : haDias(dias),
    })
    const fila = filaDaEstreia([
      p("lead@x.com", "lead", 5),
      p("sumido@x.com", "sumido", 90),
      p("cliente-velho@x.com", "cliente", 20),
      p("repor@x.com", "repor", 30),
      p("cliente-novo@x.com", "cliente", 3),
      p("b@x.com", "lead", null),
      p("a@x.com", "lead", null),
    ])
    expect(fila.map((x) => x.email)).toEqual([
      "repor@x.com",
      "cliente-novo@x.com",
      "cliente-velho@x.com",
      "sumido@x.com",
      "lead@x.com",
      "a@x.com",
      "b@x.com",
    ])
  })

  it("200 no 1º dia, 400 no 2º, 800 no 3º e o resto no 4º", () => {
    expect([0, 199, 200, 599, 600, 1399, 1400, 5000].map(loteDaPosicao)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ])
  })

  it("o 1º lote sai quando o dono liga; os outros às 10h de Brasília dos dias seguintes", () => {
    const tarde = new Date("2026-09-28T17:00:00Z") // 14h em Brasília
    expect(comecoDoLote(tarde, 0)).toEqual(tarde)
    expect(comecoDoLote(tarde, 1)).toEqual(new Date("2026-09-29T13:00:00Z"))
    expect(comecoDoLote(tarde, 3)).toEqual(new Date("2026-10-01T13:00:00Z"))
    // Ligou às 23h30: o 1º lote sai às 8h do outro dia, e o 2º no dia seguinte a esse.
    expect(comecoDoLote(new Date("2026-09-29T02:30:00Z"), 1)).toEqual(
      new Date("2026-09-30T13:00:00Z")
    )
    // Ligou às 3h: o 1º lote sai às 8h do mesmo dia.
    expect(comecoDoLote(new Date("2026-09-29T06:00:00Z"), 1)).toEqual(
      new Date("2026-09-30T13:00:00Z")
    )
    expect(fimDaEstreia(tarde)).toEqual(new Date("2026-10-05T13:00:00Z"))
  })
})

describe("a estreia no motor", () => {
  it("começa desligada, e liga como os outros", () => {
    expect(lerConfigDosFluxos({}).fluxos.estreia).toEqual({ ligado: false, desde: null })
    expect(
      lerConfigDosFluxos({
        [CHAVE_DOS_FLUXOS]: { estreia: { ligado: true, desde: AGORA.toISOString() } },
      }).fluxos.estreia
    ).toEqual({ ligado: true, desde: AGORA })
  })

  it("tem grupo de controle, e o e-mail da loja nova é o que dá o cupom", () => {
    expect(FLUXOS.estreia.semControle).toBeUndefined()
    expect(FLUXOS.estreia.toques.map((t) => [t.id, Boolean(t.cupom)])).toEqual([
      ["estreia-agora", true],
      ["estreia-2d", false],
    ])
    const decisoes = Array.from({ length: 200 }, (_, i) => {
      const email = `pessoa${i}@exemplo.com`
      return decidir({
        entradas: [{ fluxo: "estreia", chave: email, email, comeco: AGORA, comprou: false }],
        registros: [],
        ligados: { estreia: AGORA },
        agora: new Date(AGORA.getTime() + 60 * 1000),
      })?.decisao.tipo
    })
    expect(decisoes.filter((d) => d === "controle").length).toBeGreaterThan(0)
    expect(decisoes.filter((d) => d === "mandar").length).toBeGreaterThan(170)
  })

  it("quem comprou na loja nova depois do começo sai da fila", () => {
    const email = "rafael@exemplo.com"
    expect(
      decidir({
        entradas: [{ fluxo: "estreia", chave: email, email, comeco: AGORA, comprou: true }],
        registros: [],
        ligados: { estreia: AGORA },
        agora: new Date(AGORA.getTime() + 60 * 1000),
      })
    ).toBeNull()
  })
})
