import {
  hostsDaLoja,
  janelasDo,
  lerMetas,
  lerPedidosDesde,
  lerValorDaMeta,
  maisVendidosNo,
  meiaNoite,
  metaDoMes,
  montarResumo,
  numerosDo,
  perguntaDasCompras,
  perguntaDasVisitas,
  serieDo,
  somarDias,
  vendasDos,
  visitasDoPeriodo,
} from "../marketing"
import type { PedidoCru } from "../pedido"
import { lerPeriodo, type Atalho } from "../periodo"
import type { RelatorioGa4 } from "../visitas"

/**
 * O Resumo do Marketing: as janelas (o período e o de antes, do mesmo
 * tamanho), as vendas pagas, os números comparados, o gráfico, os produtos,
 * a meta do mês e as visitas do Google, com o atraso dele.
 *
 * A hora é de Brasília: 24/09/2026, 12:00 aqui = 15:00 UTC (uma quinta).
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")

/** O período de um botão, como a rota lê (o padrão do Marketing: 30 dias). */
const periodo = (atalho: Atalho, comparar = true) =>
  lerPeriodo({ periodo: atalho, ...(comparar ? {} : { comparar: "nenhum" }) }, AGORA, "30d")

/** Um instante em Brasília: "2026-09-24 10:30". */
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`).toISOString()

type Item = { produto: string; nome: string; unidades: number; total?: number; unitario?: number }

function pedido(p: {
  id: string
  pagoEm?: string
  total: number
  status?: string
  itens?: Item[]
}): PedidoCru {
  return {
    id: p.id,
    created_at: p.pagoEm ?? AGORA.toISOString(),
    status: p.status ?? "pending",
    total: p.total,
    items: (p.itens ?? []).map((i, k) => ({
      id: `${p.id}-${k}`,
      product_id: i.produto,
      product_title: i.nome,
      quantity: i.unidades,
      total: i.total,
      unit_price: i.unitario,
      thumbnail: null,
    })),
    payment_collections: p.pagoEm
      ? [{ payments: [{ amount: p.total, captured_at: p.pagoEm }] }]
      : [],
  }
}

describe("as janelas", () => {
  it("a meia-noite de Brasília e a conta de dias", () => {
    expect(meiaNoite("2026-09-24").toISOString()).toBe("2026-09-24T03:00:00.000Z")
    expect(somarDias("2026-09-01", -1)).toBe("2026-08-31")
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("7 dias: 6 inteiros e o hoje até agora; o de antes, o mesmo tanto, terminando na mesma hora", () => {
    const j = janelasDo("7d", AGORA)
    expect(j.dias).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ])
    expect(j.atual.de.toISOString()).toBe("2026-09-18T03:00:00.000Z")
    expect(j.atual.ate).toBe(AGORA)
    expect(j.antes.de.toISOString()).toBe("2026-09-11T03:00:00.000Z")
    expect(j.antes.ate.toISOString()).toBe("2026-09-17T15:00:00.000Z")
  })

  it("hoje: contra ontem até a mesma hora", () => {
    const j = janelasDo("hoje", AGORA)
    expect(j.dias).toEqual(["2026-09-24"])
    expect(j.antes.de.toISOString()).toBe("2026-09-23T03:00:00.000Z")
    expect(j.antes.ate.toISOString()).toBe("2026-09-23T15:00:00.000Z")
  })

  it("o período que não existe vira o padrão do Marketing (30 dias)", () => {
    expect(lerPeriodo({ periodo: "7d" }, AGORA, "30d").atalho).toBe("7d")
    expect(lerPeriodo({ periodo: "1a" }, AGORA, "30d").atalho).toBe("30d")
    expect(lerPeriodo({}, AGORA, "30d").atalho).toBe("30d")
  })

  it("lê os pedidos desde o de antes ou o começo do mês, o que vier primeiro, com folga", () => {
    // 7 dias: o de antes começa em 11/09, depois do dia 1º — vale o mês.
    expect(lerPedidosDesde(periodo("7d"), AGORA).toISOString()).toBe("2026-08-29T03:00:00.000Z")
    // 90 dias: o período começa em 27/06, e o de antes, em 29/03.
    expect(lerPedidosDesde(periodo("90d"), AGORA).toISOString()).toBe("2026-03-26T03:00:00.000Z")
  })
})

describe("as vendas", () => {
  it("venda é pedido pago e não cancelado, no instante em que o dinheiro entrou", () => {
    const vendas = vendasDos([
      pedido({ id: "pago", pagoEm: em("2026-09-24 10:30"), total: 128.6 }),
      pedido({ id: "pix-esperando", total: 99.9 }),
      pedido({ id: "cancelado", pagoEm: em("2026-09-24 09:00"), total: 50, status: "canceled" }),
    ])
    expect(vendas).toHaveLength(1)
    expect(vendas[0].total).toBe(128.6)
    expect(vendas[0].pagoEm.toISOString()).toBe("2026-09-24T13:30:00.000Z")
  })

  it("os números do período contra os do de antes", () => {
    const vendas = vendasDos([
      pedido({ id: "a", pagoEm: em("2026-09-24 10:00"), total: 100 }),
      pedido({ id: "b", pagoEm: em("2026-09-20 18:00"), total: 200 }),
      // Antes: dentro do período de antes (11/09 00h a 17/09 12h).
      pedido({ id: "c", pagoEm: em("2026-09-17 11:59"), total: 150 }),
      // Depois do corte do de antes (17/09 12h): não conta em nenhum dos dois.
      pedido({ id: "d", pagoEm: em("2026-09-17 12:01"), total: 999 }),
    ])
    const n = numerosDo(vendas, periodo("7d"))
    expect(n.receita).toEqual({ valor: 300, antes: 150, variacao: 100 })
    expect(n.pedidos).toEqual({ valor: 2, antes: 1, variacao: 100 })
    expect(n.ticket).toEqual({ valor: 150, antes: 150, variacao: 0 })
  })

  it("sem nada antes, não há comparação (nem 0%, nem infinito)", () => {
    const n = numerosDo(
      vendasDos([pedido({ id: "a", pagoEm: em("2026-09-24 10:00"), total: 100 })]),
      periodo("hoje")
    )
    expect(n.receita).toEqual({ valor: 100, antes: 0, variacao: null })
  })

  it("sem comparar, o de antes nem vem (0191)", () => {
    const n = numerosDo(
      vendasDos([pedido({ id: "a", pagoEm: em("2026-09-24 10:00"), total: 100 })]),
      periodo("7d", false)
    )
    expect(n.receita).toEqual({ valor: 100, antes: null, variacao: null })
    expect(n.ticket).toEqual({ valor: 100, antes: null, variacao: null })
  })
})

describe("o gráfico", () => {
  const vendas = vendasDos([
    pedido({ id: "a", pagoEm: em("2026-09-24 10:30"), total: 100 }),
    pedido({ id: "b", pagoEm: em("2026-09-24 10:50"), total: 50 }),
    pedido({ id: "c", pagoEm: em("2026-09-19 20:00"), total: 80 }),
  ])

  it("hoje: por hora, até a de agora", () => {
    const s = serieDo(periodo("hoje"), vendas, AGORA)
    expect(s.titulo).toBe("Receita por hora, hoje")
    expect(s.barras).toHaveLength(13)
    expect(s.barras[10]).toMatchObject({ valor: 150, pedidos: 2, nome: "10h", rotulo: "" })
    expect(s.barras[12]).toMatchObject({ rotulo: "agora", agora: true })
    expect(s.barras[6].rotulo).toBe("6h")
  })

  it("7 dias: por dia, com o dia da semana, e o hoje", () => {
    const s = serieDo(periodo("7d"), vendas, AGORA)
    expect(s.barras.map((b) => b.rotulo)).toEqual([
      "sex 18",
      "sáb 19",
      "dom 20",
      "seg 21",
      "ter 22",
      "qua 23",
      "hoje",
    ])
    expect(s.barras[1]).toMatchObject({ valor: 80, pedidos: 1, nome: "19/09" })
    expect(s.barras[6]).toMatchObject({ valor: 150, pedidos: 2, agora: true })
  })

  it("30 dias: 30 barras, com o dia de 7 em 7 embaixo", () => {
    const s = serieDo(periodo("30d"), vendas, AGORA)
    expect(s.barras).toHaveLength(30)
    expect(s.barras.filter((b) => b.rotulo).map((b) => b.rotulo)).toEqual([
      "26/08",
      "02/09",
      "09/09",
      "16/09",
      "hoje",
    ])
  })

  it("90 dias: por semana, de hoje pra trás — a mais velha com o que sobrou", () => {
    const s = serieDo(periodo("90d"), vendas, AGORA)
    expect(s.titulo).toBe("Receita por semana, nos últimos 90 dias")
    expect(s.barras).toHaveLength(13)
    expect(s.barras[0].nome).toBe("27/06 a 02/07")
    expect(s.barras[12]).toMatchObject({
      nome: "18/09 a 24/09",
      rotulo: "esta",
      valor: 230,
      pedidos: 3,
    })
  })
})

describe("os produtos que mais venderam", () => {
  it("em reais, somando o mesmo produto de pedidos diferentes", () => {
    const vendas = vendasDos([
      pedido({
        id: "a",
        pagoEm: em("2026-09-24 10:00"),
        total: 180,
        itens: [
          { produto: "p_oleo", nome: "Óleo para Barba — 30ml", unidades: 2, total: 100 },
          { produto: "p_balm", nome: "Balm", unidades: 1, total: 60 },
        ],
      }),
      pedido({
        id: "b",
        pagoEm: em("2026-09-23 10:00"),
        total: 70,
        // Sem o total do item: o preço vezes as unidades.
        itens: [{ produto: "p_balm", nome: "Balm", unidades: 1, unitario: 59.9 }],
      }),
    ])
    expect(maisVendidosNo(vendas, janelasDo("7d", AGORA).atual)).toEqual([
      { nome: "Balm", imagem: null, unidades: 2, receita: 119.9 },
      // O nome curto do painel (`nomeCurto`), o mesmo dos mais vendidos do Início.
      { nome: "Óleo", imagem: null, unidades: 2, receita: 100 },
    ])
  })
})

describe("a meta do mês", () => {
  it("lê só meses de verdade e valores de verdade", () => {
    expect(
      lerMetas({
        fb_metas: { "2026-09": 12000, "2026-13": 5, "2026-10": -1, x: 3, "2026-08": "9" },
      })
    ).toEqual({ "2026-09": 12000 })
    expect(lerMetas(null)).toEqual({})
  })

  it("o valor, do jeito que a pessoa escreve; vazio tira a meta", () => {
    expect(lerValorDaMeta("12.000")).toBe(12000)
    expect(lerValorDaMeta("R$ 12.000,50")).toBe(12000.5)
    expect(lerValorDaMeta(8000)).toBe(8000)
    expect(lerValorDaMeta("")).toBeNull()
    expect(lerValorDaMeta(null)).toBeNull()
    expect(lerValorDaMeta("abc")).toBe("invalido")
    expect(lerValorDaMeta("0")).toBe("invalido")
    expect(lerValorDaMeta("99.000.000")).toBe("invalido")
  })

  it("o que foi feito, o ritmo, onde fecha e quanto falta por dia (contando hoje)", () => {
    const vendas = vendasDos([
      pedido({ id: "a", pagoEm: em("2026-09-01 00:10"), total: 4800 }),
      pedido({ id: "b", pagoEm: em("2026-09-24 11:00"), total: 1200 }),
      // Agosto: não conta.
      pedido({ id: "c", pagoEm: em("2026-08-31 23:50"), total: 5000 }),
    ])
    expect(metaDoMes({ "2026-09": 12000 }, vendas, AGORA)).toEqual({
      mes: "2026-09",
      nome: "setembro",
      valor: 12000,
      feito: 6000,
      dia: 24,
      dias: 30,
      restam: 7,
      ritmo: 250,
      projecao: 7500,
      porDia: 857.14,
    })
    // Batida, ou sem meta: nada "por dia".
    expect(metaDoMes({ "2026-09": 5000 }, vendas, AGORA).porDia).toBeNull()
    expect(metaDoMes({}, vendas, AGORA)).toMatchObject({ valor: null, porDia: null, feito: 6000 })
  })
})

describe("as visitas e a conversão", () => {
  it("só os endereços da loja, com e sem o www", () => {
    expect(hostsDaLoja("https://fuckingbarba-loja.vercel.app")).toEqual([
      "fuckingbarba-loja.vercel.app",
      "www.fuckingbarba-loja.vercel.app",
    ])
    expect(hostsDaLoja("https://www.fuckingbarba.com.br/")).toEqual([
      "www.fuckingbarba.com.br",
      "fuckingbarba.com.br",
    ])
    expect(hostsDaLoja(undefined)).toEqual([])
    expect(hostsDaLoja("não é endereço")).toEqual([])
  })

  it("a pergunta: o período e o de antes, hora a hora, filtrada pelo endereço", () => {
    expect(perguntaDasVisitas(periodo("7d"), ["a.com"])).toMatchObject({
      dateRanges: [{ startDate: "2026-09-11", endDate: "2026-09-24" }],
      dimensions: [{ name: "date" }, { name: "hour" }],
      dimensionFilter: { filter: { fieldName: "hostName", inListFilter: { values: ["a.com"] } } },
    })
    expect(perguntaDasVisitas(periodo("hoje"), [])).not.toHaveProperty("dimensionFilter")
    expect(perguntaDasVisitas(periodo("hoje"), []).dateRanges[0].startDate).toBe("2026-09-23")
    // Sem comparar, só as datas do período (0191).
    expect(perguntaDasVisitas(periodo("7d", false), []).dateRanges).toEqual([
      { startDate: "2026-09-18", endDate: "2026-09-24" },
    ])
  })

  it("a pergunta das compras: as mesmas datas, hora a hora, só as da loja pelo id do pedido", () => {
    expect(perguntaDasCompras(periodo("7d"))).toEqual({
      dateRanges: [{ startDate: "2026-09-11", endDate: "2026-09-24" }],
      dimensions: [{ name: "date" }, { name: "hour" }],
      metrics: [{ name: "ecommercePurchases" }],
      dimensionFilter: {
        filter: {
          fieldName: "transactionId",
          stringFilter: { matchType: "BEGINS_WITH", value: "order_" },
        },
      },
      limit: "10000",
    })
    // A compra vai pelo servidor, sem página: o filtro do endereço a deixaria de fora.
    expect(JSON.stringify(perguntaDasCompras(periodo("hoje")))).not.toContain("hostName")
    expect(perguntaDasCompras(periodo("hoje")).dateRanges[0].startDate).toBe("2026-09-23")
  })

  /** Um relatório por dia e hora: `{ "20260924": { 9: 10 } }`. */
  const relatorio = (dias: Record<string, Record<number, number>>): RelatorioGa4 => ({
    metadata: { timeZone: "America/Sao_Paulo" },
    rows: Object.entries(dias).flatMap(([d, horas]) =>
      Object.entries(horas).map(([h, v]) => ({
        dimensionValues: [{ value: d }, { value: String(h).padStart(2, "0") }],
        metricValues: [{ value: String(v) }],
      }))
    ),
  })

  /** As duas respostas do Google: as visitas e as compras, por dia e hora. */
  const doGoogle = (
    visitas: Record<string, Record<number, number>>,
    compras: Record<string, Record<number, number>> = {}
  ) => ({ visitas: relatorio(visitas), compras: relatorio(compras) })

  it("hoje, com o Google em dia: até a hora de agora, contra ontem até a mesma hora", () => {
    const r = doGoogle(
      { "20260923": { 9: 40, 11: 10, 15: 50 }, "20260924": { 9: 20, 11: 30 } },
      // Hoje ao meio-dia: a hora ainda pela metade, fora. Ontem às 15h: fora do de antes.
      { "20260924": { 10: 1, 11: 1, 12: 1 }, "20260923": { 10: 1, 15: 1 } }
    )
    const v = visitasDoPeriodo(r, periodo("hoje"), AGORA)
    expect(v.ate).toBe(12)
    expect(v.visitas).toEqual({ valor: 50, antes: 50, variacao: 0 })
    expect(v.pedidos).toEqual({ valor: 2, antes: 1, variacao: 100 })
    expect(v.conversao).toEqual({ valor: 4, antes: 2, variacao: 100 })
  })

  it("com o Google atrasado, as compras da conversão cortam na mesma hora das visitas", () => {
    const r = doGoogle(
      { "20260923": { 7: 40, 9: 10 }, "20260924": { 7: 20, 8: 30 } },
      // Depois das 8h: o Google ainda não somou as visitas dessas horas.
      { "20260924": { 7: 1, 10: 1 }, "20260923": { 7: 1, 9: 1 } }
    )
    const v = visitasDoPeriodo(r, periodo("hoje"), AGORA)
    // A última hora com visita (8h) pode estar pela metade: conta até antes dela.
    expect(v.ate).toBe(8)
    expect(v.visitas).toEqual({ valor: 20, antes: 40, variacao: -50 })
    expect(v.pedidos).toEqual({ valor: 1, antes: 1, variacao: 0 })
    expect(v.conversao).toEqual({ valor: 5, antes: 2.5, variacao: 100 })
  })

  it("só as compras que o Google viu: sem nenhuma, a conversão é zero, não o pedido de quem recusou", () => {
    // Quem recusou os cookies pode ter pago no período: não vira visita, nem compra aqui.
    const v = visitasDoPeriodo(doGoogle({ "20260924": { 9: 20, 11: 30 } }), periodo("hoje"), AGORA)
    expect(v.visitas.valor).toBe(50)
    expect(v.pedidos).toEqual({ valor: 0, antes: 0, variacao: null })
    expect(v.conversao).toEqual({ valor: 0, antes: null, variacao: null })
  })

  it("com o Google atrasado e nada antes do corte: sem conversão", () => {
    const r = doGoogle(
      { "20260923": { 6: 5, 9: 40 }, "20260924": { 6: 8 } },
      { "20260924": { 6: 1 } }
    )
    const v = visitasDoPeriodo(r, periodo("hoje"), AGORA)
    expect(v.ate).toBe(6)
    // Ontem, só antes das 6h: nada.
    expect(v.visitas).toEqual({ valor: 0, antes: 0, variacao: null })
    expect(v.pedidos.valor).toBe(0)
    expect(v.conversao.valor).toBeNull()
  })

  it("7 dias: os 6 dias inteiros e o hoje até o corte; o de antes, igual", () => {
    const r = doGoogle(
      {
        "20260911": { 10: 7 },
        "20260917": { 10: 3, 13: 100 },
        "20260918": { 20: 5 },
        "20260923": { 23: 5 },
        "20260924": { 0: 1, 11: 2 },
      },
      {
        "20260911": { 10: 1 },
        "20260917": { 13: 2 },
        "20260918": { 20: 1 },
        "20260924": { 11: 1, 12: 1 },
      }
    )
    const v = visitasDoPeriodo(r, periodo("7d"), AGORA)
    expect(v.ate).toBe(12)
    expect(v.visitas).toEqual({ valor: 13, antes: 10, variacao: 30 })
    expect(v.pedidos).toEqual({ valor: 2, antes: 1, variacao: 100 })
    expect(v.conversao).toEqual({ valor: 15.38, antes: 10, variacao: 54 })
  })

  it("um período que já acabou vai inteiro, sem corte; sem comparar, o de antes é nulo (0191)", () => {
    const r = doGoogle(
      { "20260922": { 9: 10, 22: 5 }, "20260921": { 20: 7 }, "20260924": { 9: 99 } },
      { "20260922": { 22: 1 } }
    )
    const ontem = lerPeriodo({ de: "2026-09-22", ate: "2026-09-22" }, AGORA, "30d")
    const v = visitasDoPeriodo(r, ontem, AGORA)
    expect(v.ate).toBeNull()
    expect(v.visitas).toEqual({ valor: 15, antes: 7, variacao: 114 })
    expect(v.pedidos).toEqual({ valor: 1, antes: 0, variacao: null })
    const sem = visitasDoPeriodo(
      r,
      lerPeriodo({ de: "2026-09-22", ate: "2026-09-22", comparar: "nenhum" }, AGORA, "30d"),
      AGORA
    )
    expect(sem.visitas).toEqual({ valor: 15, antes: null, variacao: null })
    expect(sem.conversao).toEqual({ valor: 6.67, antes: null, variacao: null })
  })

  it("nada de hoje ainda: `ate` nulo, e os dias inteiros contam", () => {
    const v = visitasDoPeriodo(doGoogle({ "20260923": { 9: 40 } }), periodo("7d"), AGORA)
    expect(v.ate).toBeNull()
    expect(v.visitas.valor).toBe(40)
  })
})

describe("o resumo inteiro", () => {
  it("junta os números, o gráfico, os produtos e a meta do período", () => {
    const r = montarResumo(
      periodo("7d"),
      [pedido({ id: "a", pagoEm: em("2026-09-24 10:00"), total: 100 })],
      { "2026-09": 1000 },
      AGORA
    )
    expect(r.periodo).toMatchObject({ atalho: "7d", nome: "Últimos 7 dias", comparar: true })
    expect(r.numeros.receita.valor).toBe(100)
    expect(r.serie.barras).toHaveLength(7)
    expect(r.meta).toMatchObject({ valor: 1000, feito: 100 })
    expect(r.maisVendidos).toEqual([])
  })
})
