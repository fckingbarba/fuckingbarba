import { canalDe, montarCanais, perguntasDosCanais } from "../marketing-canais"
import type { RelatorioGa4 } from "../visitas"

/**
 * Os canais do Marketing: o nome de cada canal (com o anúncio separado da
 * busca), as perguntas ao GA4 (as visitas só do endereço da loja, as compras
 * só as da loja), a soma por canal e por campanha, o que ficou sem origem e
 * o achado.
 */

/** Linhas do GA4: `[fonte, meio, campanha, ...métricas]`. */
const relatorio = (linhas: [string, string, string, ...number[]][]): RelatorioGa4 => ({
  rows: linhas.map(([fonte, meio, campanha, ...m]) => ({
    dimensionValues: [{ value: fonte }, { value: meio }, { value: campanha }],
    metricValues: m.map((v) => ({ value: String(v) })),
  })),
})

describe("o nome do canal", () => {
  it("o do Início, com o anúncio separado da busca e o influenciador com nome próprio", () => {
    expect(canalDe("l.instagram.com", "referral")).toBe("Instagram")
    expect(canalDe("instagram", "social")).toBe("Instagram")
    expect(canalDe("instagram", "paid")).toBe("Instagram (anúncio)")
    expect(canalDe("google", "organic")).toBe("Google (busca)")
    expect(canalDe("google", "cpc")).toBe("Google (anúncio)")
    expect(canalDe("influenciador", "social")).toBe("Influenciadores")
    expect(canalDe("(direct)", "(none)")).toBe("Direto")
    expect(canalDe("email", "email")).toBe("E-mail")
    expect(canalDe("whatsapp", "social")).toBe("WhatsApp")
  })
})

describe("as perguntas ao GA4", () => {
  it("as visitas só do endereço da loja; as compras só as da loja, pelo id do pedido", () => {
    const [visitas, compras] = perguntasDosCanais("7d", ["loja.com"])
    expect(visitas.dateRanges).toEqual([{ startDate: "6daysAgo", endDate: "today" }])
    expect(visitas.dimensions.map((d) => d.name)).toEqual([
      "sessionSource",
      "sessionMedium",
      "sessionCampaignName",
    ])
    expect(visitas).toMatchObject({
      dimensionFilter: {
        filter: { fieldName: "hostName", inListFilter: { values: ["loja.com"] } },
      },
    })
    expect(compras.metrics.map((m) => m.name)).toEqual(["ecommercePurchases", "purchaseRevenue"])
    expect(compras.dimensionFilter).toEqual({
      filter: {
        fieldName: "transactionId",
        stringFilter: { matchType: "BEGINS_WITH", value: "order_" },
      },
    })
    expect(perguntasDosCanais("hoje", [])[0]).not.toHaveProperty("dimensionFilter")
  })
})

describe("os canais e as campanhas", () => {
  const visitas = relatorio([
    ["instagram", "social", "stories-setembro", 100],
    ["l.instagram.com", "referral", "(referral)", 50],
    ["google", "organic", "(organic)", 80],
    ["google", "cpc", "black-friday", 20],
    ["(direct)", "(none)", "(direct)", 30],
  ])
  const compras = relatorio([
    ["instagram", "social", "stories-setembro", 3, 300],
    ["google", "organic", "(organic)", 2, 200],
    ["google", "cpc", "black-friday", 1, 150],
  ])

  it("soma por canal, com a conversão, do que mais vendeu pro que menos", () => {
    const c = montarCanais([visitas, compras], { pedidos: 8, receita: 900 })
    expect(c.canais).toEqual([
      { nome: "Instagram", visitas: 150, pedidos: 3, receita: 300, conversao: 2 },
      { nome: "Google (busca)", visitas: 80, pedidos: 2, receita: 200, conversao: 2.5 },
      { nome: "Google (anúncio)", visitas: 20, pedidos: 1, receita: 150, conversao: 5 },
      { nome: "Direto", visitas: 30, pedidos: 0, receita: 0, conversao: 0 },
    ])
    expect(c.totais).toEqual({ visitas: 280, pedidos: 6, receita: 650 })
  })

  it("as campanhas são só as dos links com UTM, com o canal de onde mais veio gente", () => {
    const c = montarCanais([visitas, compras], { pedidos: 8, receita: 900 })
    expect(c.campanhas).toEqual([
      { nome: "stories-setembro", canal: "Instagram", visitas: 100, pedidos: 3, receita: 300 },
      { nome: "black-friday", canal: "Google (anúncio)", visitas: 20, pedidos: 1, receita: 150 },
    ])
  })

  it("o que a loja vendeu e o GA4 não viu fica sem origem (quem recusou os cookies)", () => {
    expect(montarCanais([visitas, compras], { pedidos: 8, receita: 900 }).semOrigem).toEqual({
      pedidos: 2,
      receita: 250,
    })
    // Nunca negativo (o GA4 somou uma compra que a loja ainda não pagou, por exemplo).
    expect(montarCanais([visitas, compras], { pedidos: 5, receita: 600 }).semOrigem).toEqual({
      pedidos: 0,
      receita: 0,
    })
  })

  it("a campanha que vendeu sem visita no período leva o canal da compra", () => {
    const c = montarCanais(
      [relatorio([]), relatorio([["email", "email", "newsletter-15-09", 1, 99.9]])],
      { pedidos: 1, receita: 99.9 }
    )
    expect(c.campanhas).toEqual([
      { nome: "newsletter-15-09", canal: "E-mail", visitas: 0, pedidos: 1, receita: 99.9 },
    ])
    expect(c.canais[0]).toMatchObject({ nome: "E-mail", conversao: null })
  })

  it("o achado: o que vende mais por visita contra o que traz mais gente", () => {
    expect(montarCanais([visitas, compras], { pedidos: 8, receita: 900 }).achado).toEqual({
      tipo: "bom",
      titulo: "Google (busca) vende mais por visita; Instagram traz mais gente",
      texto:
        "Google (busca) converte 2,50% das visitas; Instagram, 2,00% — mas traz 2 vezes mais " +
        "visitas. Os dois juntos: Instagram pra trazer, Google (busca) pra fechar.",
    })
  })

  it("com pouca visita, o achado diz que ainda é cedo", () => {
    const c = montarCanais([relatorio([["instagram", "social", "(not set)", 40]]), relatorio([])], {
      pedidos: 0,
      receita: 0,
    })
    expect(c.achado).toMatchObject({ tipo: "info", titulo: "Ainda é pouco pra comparar os canais" })
  })
})
