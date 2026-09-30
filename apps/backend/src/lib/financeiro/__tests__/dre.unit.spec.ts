import type { DespesaNoMes } from "../despesas"
import {
  colunaDoMes,
  deCada100,
  dreDoMes,
  dreDoPeriodo,
  linhasNaTela,
  mapaDosSkus,
  tipoDoCodigo,
  vendaDaLoja,
  vendaDaNuvemshop,
  type DadosDoDre,
  type DreDoPeriodo,
  type IdDaLinha,
  type PedidoDaBaseDoDre,
  type PedidoDoDre,
} from "../dre"

/**
 * O DRE: cada venda (a loja nova e a Nuvemshop) virando receita, desconto,
 * estorno e custo; o mês inteiro, linha a linha, até o lucro; a soma de
 * vários meses; o que falta; e o que a tela recebe.
 *
 * Setembro de exemplo (a hora é de Brasília):
 *   P1 · loja nova, 28/09 — 3 Óleos (Leve 3, pague 2), 1 Balm (a oferta do checkout),
 *        frete de R$ 18,50 com cupom de frete: cobrou R$ 158,31
 *   P2 · loja nova, 29/09 — 1 Shampoo e frete de R$ 15: cancelado e estornado em 30/09
 *   N1 · Nuvemshop, 10/09 — 2 Óleos e uma Pomada Antiga (sem SKU de hoje): R$ 158,90
 *   N3 · Nuvemshop, 05/09 — 2 Shampoos, estornado
 *   N2 · Nuvemshop, 15/08 — 2 Shampoos: é de agosto
 */

const em = (quando: string) => `${quando.replace(" ", "T")}:00-03:00`

type Item = {
  produto: string
  titulo: string
  unit: number
  qtd: number
  ajustes?: [string, number][]
}

function pedido(o: {
  id: string
  itens: Item[]
  frete?: { valor: number; ajustes?: [string, number][] }
  total: number
  credito?: number
  pagoEm?: string | null
  status?: string
  estornos?: [number, string][]
}): PedidoDoDre {
  return {
    id: o.id,
    created_at: o.pagoEm ? em(o.pagoEm) : em("2026-09-01 10:00"),
    status: o.status ?? "pending",
    total: o.total,
    credit_line_total: o.credito ?? 0,
    items: o.itens.map((i, n) => ({
      id: `${o.id}-item-${n}`,
      product_id: i.produto,
      product_title: i.titulo,
      unit_price: i.unit,
      quantity: i.qtd,
      adjustments: (i.ajustes ?? []).map(([code, amount]) => ({ code, amount })),
    })),
    shipping_methods: o.frete
      ? [
          {
            amount: o.frete.valor,
            adjustments: (o.frete.ajustes ?? []).map(([code, amount]) => ({ code, amount })),
          },
        ]
      : [],
    payment_collections: [
      {
        payments: [
          {
            captured_at: o.pagoEm ? em(o.pagoEm) : null,
            refunds: (o.estornos ?? []).map(([amount, quando]) => ({
              amount,
              created_at: em(quando),
            })),
          },
        ],
      },
    ],
  }
}

const P1 = pedido({
  id: "order_p1",
  itens: [
    { produto: "prod_oleo", titulo: "Óleo", unit: 54.9, qtd: 3, ajustes: [["PROMO-LEVE3", 54.9]] },
    {
      produto: "prod_balm",
      titulo: "Balm",
      unit: 53.9,
      qtd: 1,
      ajustes: [["BUMP-BALM-3F9A", 5.39]],
    },
  ],
  frete: { valor: 18.5, ajustes: [["FRETEGRATIS", 18.5]] },
  total: 158.31,
  pagoEm: "2026-09-28 10:00",
})
const P2 = pedido({
  id: "order_p2",
  itens: [{ produto: "prod_shampoo", titulo: "Shampoo", unit: 49.9, qtd: 1 }],
  frete: { valor: 15 },
  total: 0,
  credito: 64.9,
  pagoEm: "2026-09-29 09:00",
  status: "canceled",
  estornos: [[64.9, "2026-09-30 08:00"]],
})
const PIX_VENCIDO = pedido({
  id: "order_pix",
  itens: [{ produto: "prod_oleo", titulo: "Óleo", unit: 54.9, qtd: 1 }],
  total: 54.9,
  pagoEm: null,
})

const PRODUTOS = [
  { id: "prod_oleo", titulo: "Óleo", skus: ["FBOL01"] },
  { id: "prod_balm", titulo: "Balm", skus: ["FBBM01"] },
  { id: "prod_shampoo", titulo: "Shampoo", skus: ["fbsh01 "] },
]
const doSku = mapaDosSkus(PRODUTOS)

const base = (o: Partial<PedidoDaBaseDoDre> & { numero: string }): PedidoDaBaseDoDre => ({
  pagoEm: null,
  feitoEm: em("2026-09-01 10:00"),
  pagamento: "confirmado",
  total: 0,
  desconto: 0,
  frete: 0,
  itens: [],
  ...o,
})
const N1 = base({
  numero: "4101",
  pagoEm: em("2026-09-10 14:00"),
  total: 15890,
  desconto: 1000,
  frete: 1590,
  itens: [
    { sku: "FBOL01", nome: "Óleo para Barba", quantidade: 2, valor: 54.9 },
    { sku: "ANTIGO9", nome: "Pomada Antiga", quantidade: 1, valor: 49 },
  ],
})
const N2 = base({
  numero: "4002",
  pagoEm: em("2026-08-15 11:00"),
  total: 10000,
  itens: [{ sku: "FBSH01", quantidade: 2, valor: 50 }],
})
const N3 = base({
  numero: "4050",
  pagoEm: em("2026-09-05 16:00"),
  pagamento: "estornado",
  total: 9990,
  itens: [{ sku: "FBSH01", quantidade: 2, valor: 49.95 }],
})

const despesa = (
  mes: string,
  categoria: string,
  descricao: string,
  valor: number
): DespesaNoMes => ({
  mes,
  categoria,
  descricao,
  valor,
})

const DADOS: DadosDoDre = {
  vendas: [
    vendaDaLoja(P1)!,
    vendaDaLoja(P2)!,
    vendaDaNuvemshop(N1, doSku)!,
    vendaDaNuvemshop(N2, doSku)!,
    vendaDaNuvemshop(N3, doSku)!,
  ],
  despesas: [
    despesa("2026-09", "marketing", "Meta Ads", 980000),
    despesa("2026-09", "plataforma", "Vercel", 16800),
    despesa("2026-09", "taxas", "Nuvem Pago, 1 a 26/09", 211840),
    despesa("2026-09", "tarifas", "Tarifas e IOF", 18560),
  ],
  custos: new Map([
    ["prod_oleo", [{ desde: "2026-02-01", valor: 1140 }]],
    [
      "prod_shampoo",
      [
        { desde: "2026-02-01", valor: 980 },
        { desde: "2026-09-20", valor: 1050 },
      ],
    ],
  ]),
  embalagem: [{ desde: "2026-02-01", valor: 320 }],
  simples: [{ desde: "2026-08-01", valor: 654 }],
}

const valorDe = (linhas: { id: IdDaLinha; valor: number }[], id: IdDaLinha) =>
  linhas.find((l) => l.id === id)!.valor
const linhaDe = <L extends { id: IdDaLinha }>(d: { linhas: L[] }, id: IdDaLinha): L =>
  d.linhas.find((l) => l.id === id)!

describe("cada venda", () => {
  it("o código do ajuste diz de onde veio o desconto", () => {
    expect(tipoDoCodigo("PROMO-LEVE3")).toBe("promocao")
    expect(tipoDoCodigo("BUMP-OLEO-1A2B")).toBe("oferta")
    expect(tipoDoCodigo("VOLTA-7KQ2MX")).toBe("crm")
    expect(tipoDoCodigo("BROTHER-7KQ2MX")).toBe("crm")
    expect(tipoDoCodigo("BARBA20")).toBe("cupom")
    expect(tipoDoCodigo(null)).toBe("cupom")
  })

  it("da loja nova: os produtos antes dos cupons, o frete, o cobrado e cada desconto", () => {
    const v = vendaDaLoja(P1)!
    expect(v).toMatchObject({ origem: "loja", produtos: 218.6, frete: 18.5, cobrado: 158.31 })
    expect(v.descontos).toEqual([
      { tipo: "promocao", valor: 54.9 },
      { tipo: "oferta", valor: 5.39 },
      { tipo: "cupom", valor: 18.5 },
    ])
    expect(v.itens).toEqual([
      { produto: "prod_oleo", nome: "Óleo", unidades: 3 },
      { produto: "prod_balm", nome: "Balm", unidades: 1 },
    ])
    expect(v.cancelada).toBe(false)
    expect(v.pagoEm.toISOString()).toBe("2026-09-28T13:00:00.000Z")
  })

  it("os descontos sempre fecham com o cobrado — o centavo do arredondamento aparece", () => {
    // A oferta de 10% deixa fração no Medusa (R$ 123,355) e o Pagar.me cobra R$ 123,36.
    const v = vendaDaLoja(
      pedido({
        id: "order_fracao",
        itens: [
          { produto: "prod_oleo", titulo: "Óleo", unit: 54.9, qtd: 1 },
          {
            produto: "prod_balm",
            titulo: "Balm",
            unit: 52.45,
            qtd: 1,
            ajustes: [["BUMP-B-1", 5.245]],
          },
        ],
        frete: { valor: 21.3 },
        total: 123.405,
        pagoEm: "2026-09-28 10:00",
      })
    )!
    const soma = v.descontos.reduce((s, d) => s + d.valor, 0)
    expect(Math.round((v.produtos + v.frete - soma) * 100) / 100).toBe(v.cobrado)
  })

  it("o cancelado depois de pago entra e sai no estorno; o que não pagou não entra", () => {
    const v = vendaDaLoja(P2)!
    expect(v).toMatchObject({ produtos: 49.9, frete: 15, cobrado: 64.9, cancelada: true })
    expect(v.descontos).toEqual([])
    expect(v.estornos).toEqual([{ valor: 64.9, em: new Date(em("2026-09-30 08:00")) }])
    expect(vendaDaLoja(PIX_VENCIDO)).toBeNull()
  })

  it("da Nuvemshop: o produto pelo SKU de hoje; o estornado sai inteiro no mesmo mês", () => {
    const v = vendaDaNuvemshop(N1, doSku)!
    expect(v).toMatchObject({ origem: "nuvemshop", produtos: 153, frete: 15.9, cobrado: 158.9 })
    expect(v.descontos).toEqual([{ tipo: "nuvemshop", valor: 10 }])
    expect(v.itens).toEqual([
      { produto: "prod_oleo", nome: "Óleo", unidades: 2 },
      { produto: null, nome: "Pomada Antiga", unidades: 1 },
    ])
    const e = vendaDaNuvemshop(N3, doSku)!
    expect(e.cancelada).toBe(true)
    expect(e.estornos).toEqual([{ valor: 99.9, em: e.pagoEm }])
    expect(
      vendaDaNuvemshop(base({ numero: "1", pagamento: "recusado", total: 100 }), doSku)
    ).toBeNull()
  })
})

describe("o DRE de um mês", () => {
  const set = dreDoMes("2026-09", DADOS)
  const v = (id: IdDaLinha) => valorDe(set.linhas, id)

  it("a receita bruta: produtos antes dos cupons e o frete, das duas lojas", () => {
    expect(v("vendas")).toBe(521.4)
    expect(v("freteCobrado")).toBe(49.4)
    expect(v("bruta")).toBe(570.8)
    expect(linhaDe(set, "vendas").detalhe).toEqual([
      { nome: "Loja nova", valor: 268.5 },
      { nome: "Nuvemshop", valor: 252.9 },
    ])
  })

  it("as deduções: os descontos por tipo, os estornos do mês e o Simples sobre o que sobra", () => {
    expect(v("descontos")).toBe(-88.79)
    expect(linhaDe(set, "descontos").detalhe.map((d) => d.nome)).toEqual([
      "Leve X, pague Y",
      "Oferta do checkout",
      "Outros cupons",
      "Descontos na Nuvemshop",
    ])
    expect(v("cancelamentos")).toBe(-164.8)
    // (570,80 − 88,79 − 164,80) × 6,54% = 20,75 — a alíquota de agosto, que setembro não tem.
    expect(v("simples")).toBe(-20.75)
    expect(linhaDe(set, "simples").falta).toBe("% de agosto")
    expect(v("deducoes")).toBe(-274.34)
    expect(v("liquida")).toBe(296.46)
  })

  it("o custo: o que valia no dia da venda, sem o cancelado; o que não tem custo, avisado", () => {
    // Óleo: 3 (P1) + 2 (N1) a R$ 11,40. O Balm e a Pomada Antiga, sem custo.
    expect(v("custo")).toBe(-57)
    expect(linhaDe(set, "custo").falta).toBe("2 sem custo")
    expect(linhaDe(set, "custo").detalhe).toEqual([
      { nome: "Óleo · 5 unidades", valor: -57 },
      { nome: "Balm · 1 unidade sem custo", valor: null },
      { nome: "Pomada Antiga · 1 unidade sem custo", valor: null },
    ])
    expect(v("embalagem")).toBe(-6.4)
    expect(v("lucroBruto")).toBe(233.06)
  })

  it("as despesas lançadas caem cada uma na sua linha, até o lucro", () => {
    expect(v("taxas")).toBe(-2118.4)
    expect(v("variaveis")).toBe(-2118.4)
    expect(v("margem")).toBe(-1885.34)
    expect(v("marketing")).toBe(-9800)
    expect(v("plataforma")).toBe(-168)
    expect(v("fixas")).toBe(-9968)
    expect(v("operacional")).toBe(-11853.34)
    expect(v("financeiro")).toBe(-185.6)
    expect(v("lucro")).toBe(-12038.94)
    expect(set.pedidos).toBe(2)
  })

  it("a taxa e o frete da loja nova ainda não entram sozinhos; o frete da Nuvemshop, sem lançar", () => {
    expect(linhaDe(set, "taxas").falta).toBe("loja nova: ainda não")
    expect(linhaDe(set, "fretePago").falta).toBe("falta lançar")
    expect(set.faltas.daLojaNova).toBe(2)
    expect(set.faltas.freteDaNuvemshop).toEqual(["2026-09"])
    expect(set.faltas.taxasDaNuvemshop).toEqual([])
  })

  it("o custo novo do shampoo só vale dali em diante", () => {
    const d = dreDoMes("2026-08", DADOS)
    expect(valorDe(d.linhas, "custo")).toBe(-19.6)
    const depois = dreDoMes("2026-09", {
      ...DADOS,
      vendas: [vendaDaNuvemshop({ ...N2, numero: "5", pagoEm: em("2026-09-21 10:00") }, doSku)!],
    })
    expect(valorDe(depois.linhas, "custo")).toBe(-21)
  })

  it("sem venda e sem despesa, tudo zero e nada faltando", () => {
    const vazio = dreDoMes("2026-03", DADOS)
    expect(vazio.linhas.every((l) => l.valor === 0 && !l.falta)).toBe(true)
  })
})

describe("vários meses e a tela", () => {
  const ago = dreDoMes("2026-08", DADOS)
  const set = dreDoMes("2026-09", DADOS)
  const periodo: DreDoPeriodo = dreDoPeriodo([ago, set])

  it("somam linha a linha, e os detalhes pelo nome", () => {
    expect(valorDe(periodo.linhas, "bruta")).toBe(670.8)
    expect(valorDe(periodo.linhas, "lucro")).toBe(-11968.28)
    expect(linhaDe(periodo, "custo").detalhe).toEqual([
      { nome: "Shampoo · 2 unidades", valor: -19.6 },
      { nome: "Óleo · 5 unidades", valor: -57 },
      { nome: "Balm · 1 unidade sem custo", valor: null },
      { nome: "Pomada Antiga · 1 unidade sem custo", valor: null },
    ])
    expect(periodo.pedidos).toBe(3)
  })

  it("o que falta vira frase, com a aba onde se resolve", () => {
    const so = dreDoPeriodo([set]).pendencias
    expect(so.map((p) => p.id)).toEqual(["custo", "simples", "frete", "loja-nova"])
    expect(so[0]).toEqual({
      id: "custo",
      texto:
        "2 produtos sem custo — Balm e Pomada Antiga (2 unidades). O custo dos produtos está menor do que foi.",
      onde: "custos",
    })
    expect(so[1].texto).toBe("A alíquota do Simples de setembro não veio: usei a de agosto.")
    expect(so[3].texto).toContain("2 pedidos da loja nova (desde 27/09)")
    // Agosto não tem nada lançado: a taxa e o frete da Nuvemshop.
    const juntos = periodo.pendencias.map((p) => p.id)
    expect(juntos).toContain("taxas")
    expect(periodo.pendencias.find((p) => p.id === "frete")!.texto).toBe(
      "O frete pago na Nuvemshop em agosto e setembro não foi lançado."
    )
  })

  it("a tela: o % de cada R$ 100 vendidos e quanto mudou do de antes", () => {
    const linhas = linhasNaTela(dreDoPeriodo([set]), dreDoPeriodo([ago]))
    const bruta = linhas.find((l) => l.id === "bruta")!
    expect(bruta).toMatchObject({ pct: 100, antes: 100, pctAntes: 100, variacao: 470.8 })
    const simples = linhas.find((l) => l.id === "simples")!
    expect(simples.pct).toBe(-3.6)
    expect(linhas.find((l) => l.id === "financeiro")!.variacao).toBeNull()
  })

  it("de cada R$ 100: as partes somam os 100", () => {
    const partes = deCada100(dreDoPeriodo([ago]))
    expect(partes.map((p) => p.nome).at(-1)).toBe("Sobra (lucro)")
    expect(Math.round(partes.reduce((s, p) => s + p.valor, 0))).toBe(100)
    expect(deCada100(dreDoPeriodo([set])).at(-1)!.nome).toBe("Faltou (prejuízo)")
  })

  it("no mês a mês, a linha que falta e os totais depois dela ficam marcados", () => {
    const c = colunaDoMes(set)
    expect(c).toMatchObject({ mes: "2026-09", curto: "Set", origem: "Nuvemshop + loja nova" })
    expect(c.incompletas).toEqual([
      "deducoes",
      "simples",
      "liquida",
      "custoDosProdutos",
      "custo",
      "lucroBruto",
      "variaveis",
      "taxas",
      "fretePago",
      "margem",
      "operacional",
      "lucro",
    ])
    expect(colunaDoMes(ago).origem).toBe("Nuvemshop")
    expect(colunaDoMes(ago).margemLiquida).toBe(70.7)
  })
})
