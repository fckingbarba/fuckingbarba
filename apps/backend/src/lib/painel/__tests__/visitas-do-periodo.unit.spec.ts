import { lerPeriodo } from "../periodo"
import type { RelatorioGa4 } from "../visitas"
import {
  caminhosDeCategoria,
  corteDoGoogle,
  montarVisitasNoPeriodo,
  perguntasDoPeriodo,
} from "../visitas-do-periodo"

/**
 * As visitas do Início no período (0186): as perguntas ao Google, o corte
 * de hoje (o Google soma com atraso), as visitas contra o de antes, o que
 * elas fizeram e as taxas. 28/09/2026, 15:40 em Brasília (18:40 UTC).
 */

const AGORA = new Date("2026-09-28T18:40:00.000Z")
const BRASILIA = { timeZone: "America/Sao_Paulo" }

/** Linhas por dia e hora: `[["20260928", 9, 12], …]`. */
const porHora = (linhas: [string, number, number][]): RelatorioGa4 => ({
  metadata: BRASILIA,
  rows: linhas.map(([d, h, v]) => ({
    dimensionValues: [{ value: d }, { value: String(h).padStart(2, "0") }],
    metricValues: [{ value: String(v) }],
  })),
})
/** Linhas por dia e mais uma dimensão (o evento): `[["20260928", "view_item", 30], …]`. */
const porDia = (linhas: [string, string | null, number][]): RelatorioGa4 => ({
  metadata: BRASILIA,
  rows: linhas.map(([d, x, v]) => ({
    dimensionValues: x === null ? [{ value: d }] : [{ value: d }, { value: x }],
    metricValues: [{ value: String(v) }],
  })),
})

describe("as perguntas ao Google", () => {
  it("quem não abre o Marketing: só as visitas por dia e hora, do começo do de antes ao fim", () => {
    const p = lerPeriodo({ periodo: "7d" }, AGORA)
    const [visitas, ...resto] = perguntasDoPeriodo(p, ["www.loja.com.br"], [], false) as Record<
      string,
      unknown
    >[]
    expect(resto).toEqual([])
    expect(visitas).toMatchObject({
      dateRanges: [{ startDate: "2026-09-15", endDate: "2026-09-28" }],
      dimensions: [{ name: "date" }, { name: "hour" }],
      dimensionFilter: {
        filter: { fieldName: "hostName", inListFilter: { values: ["www.loja.com.br"] } },
      },
    })
  })

  it("quem abre: os eventos, as páginas de categoria e as origens, só do período", () => {
    const p = lerPeriodo({ periodo: "ontem", comparar: "nenhum" }, AGORA)
    const perguntas = perguntasDoPeriodo(p, [], ["barba", "kits"], true) as Record<
      string,
      unknown
    >[]
    expect(perguntas).toHaveLength(4)
    expect(perguntas[0]).toMatchObject({
      dateRanges: [{ startDate: "2026-09-27", endDate: "2026-09-27" }],
    })
    expect(perguntas[0].dimensionFilter).toBeUndefined()
    expect(perguntas[1]).toMatchObject({
      dimensions: [{ name: "date" }, { name: "eventName" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", inListFilter: { values: ["view_item", "add_to_cart"] } },
      },
    })
    expect(perguntas[2]).toMatchObject({
      dateRanges: [{ startDate: "2026-09-27", endDate: "2026-09-27" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                stringFilter: { matchType: "EXACT", value: "page_view" },
              },
            },
            { filter: { fieldName: "pagePath", stringFilter: { matchType: "FULL_REGEXP" } } },
          ],
        },
      },
    })
    expect(perguntas[3]).toMatchObject({
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    })
  })

  it("hoje contra ontem: a 5ª pergunta, as sacolas de ontem por hora (0212)", () => {
    const p = lerPeriodo({}, AGORA)
    const perguntas = perguntasDoPeriodo(p, [], [], true) as Record<string, unknown>[]
    expect(perguntas).toHaveLength(5)
    expect(perguntas[4]).toMatchObject({
      dateRanges: [{ startDate: "2026-09-27", endDate: "2026-09-27" }],
      dimensions: [{ name: "date" }, { name: "hour" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { value: "add_to_cart" } },
      },
    })
    expect(perguntasDoPeriodo(lerPeriodo({ periodo: "ontem" }, AGORA), [], [], true)).toHaveLength(
      4
    )
  })

  it("as páginas de categoria: as vitrines das duas lojas, nunca a página de um produto", () => {
    const re = new RegExp(caminhosDeCategoria(["barba", "cabelo", "kits", "produtos", "TORTA!"]))
    for (const sim of [
      "/produtos",
      "/barba",
      "/barba/",
      "/kits",
      "/produtos-para-a-barba/",
      "/produtos-para-a-barba/balm/",
      "/comprar/",
      "/para-o-cabelo",
    ])
      expect([sim, re.test(sim)]).toEqual([sim, true])
    for (const nao of [
      "/",
      "/produtos/oleo-para-barba",
      "/barbaridade",
      "/barba/ordem/menor-preco",
      "/checkout",
      "/TORTA!",
    ])
      expect([nao, re.test(nao)]).toEqual([nao, false])
  })
})

describe("o corte de hoje", () => {
  const p = lerPeriodo({ periodo: "7d" }, AGORA)

  it("em dia (a última hora com visita é a de agora ou a anterior): até a hora de agora", () => {
    expect(corteDoGoogle(porHora([["20260928", 14, 3]]), p, AGORA)).toBe(15)
    expect(corteDoGoogle(porHora([["20260928", 15, 1]]), p, AGORA)).toBe(15)
  })

  it("atrasado: até a última hora que o Google somou, sem ela", () => {
    expect(
      corteDoGoogle(
        porHora([
          ["20260928", 9, 5],
          ["20260928", 11, 2],
        ]),
        p,
        AGORA
      )
    ).toBe(11)
  })

  it("nada de hoje ainda: zero; o período que já acabou não tem corte", () => {
    expect(corteDoGoogle(porHora([["20260927", 20, 9]]), p, AGORA)).toBe(0)
    expect(
      corteDoGoogle(porHora([["20260927", 20, 9]]), lerPeriodo({ periodo: "ontem" }, AGORA), AGORA)
    ).toBeNull()
  })
})

describe("as visitas do período", () => {
  it("no corte de hoje dos dois lados; o gráfico com o de antes inteiro", () => {
    const p = lerPeriodo({}, AGORA)
    const v = montarVisitasNoPeriodo(
      [
        porHora([
          ["20260928", 9, 10],
          ["20260928", 12, 20], // a última que o Google somou: o corte fica em 12h, sem ela
          ["20260927", 9, 8],
          ["20260927", 12, 5],
          ["20260927", 20, 40],
        ]),
      ],
      p,
      AGORA,
      { completo: false }
    )
    expect(v.ate).toBe(12)
    expect(v.visitas).toEqual({ valor: 10, antes: 8, variacao: 25 })
    expect(v.barras[9]).toEqual({ visitas: 10, antes: 8 })
    expect(v.barras[20]).toEqual({ visitas: 0, antes: 40 })
    expect(v.comportamento).toBeUndefined()
  })

  it("quem abre o Marketing: o que as visitas fizeram, as taxas, as origens e o agora", () => {
    const p = lerPeriodo({ periodo: "ontem" }, AGORA)
    const v = montarVisitasNoPeriodo(
      [
        porHora([
          ["20260927", 10, 300],
          ["20260927", 20, 120],
          ["20260926", 10, 356],
        ]),
        porDia([
          ["20260927", "view_item", 413],
          ["20260927", "add_to_cart", 22],
          ["20260926", "add_to_cart", 20],
        ]),
        porDia([["20260927", null, 70]]),
        {
          rows: [
            {
              dimensionValues: [{ value: "instagram.com" }, { value: "referral" }],
              metricValues: [{ value: "168" }],
            },
            {
              dimensionValues: [{ value: "(direct)" }, { value: "(none)" }],
              metricValues: [{ value: "84" }],
            },
          ],
        },
      ],
      p,
      AGORA,
      { completo: true, noSite: 5, vendas: { atual: 8, antes: 6 } }
    )
    expect(v.ate).toBeNull()
    expect(v.visitas).toEqual({ valor: 420, antes: 356, variacao: 18 })
    expect(v.comportamento).toEqual({ visitas: 420, categoria: 70, produto: 413, sacola: 22 })
    expect(v.taxas?.compraram).toEqual({ valor: 1.9, antes: 1.69, variacao: 12, de: 8, em: 420 })
    expect(v.taxas?.sacola).toEqual({ valor: 5.24, antes: 5.62, variacao: -7, de: 22, em: 420 })
    expect(v.origens).toEqual([
      { nome: "Instagram", visitas: 168 },
      { nome: "Direto", visitas: 84 },
    ])
    expect(v.agora).toBe(5)
  })

  it("hoje: a sacola de ontem para na hora do corte, e a taxa diz as vendas do dia inteiro (0212)", () => {
    const p = lerPeriodo({}, AGORA)
    const v = montarVisitasNoPeriodo(
      [
        porHora([
          ["20260928", 9, 100],
          ["20260928", 14, 80], // em dia (15:40): o corte fica em 15h
          ["20260927", 9, 200],
          ["20260927", 14, 87],
          ["20260927", 20, 150], // depois do corte: não entra na conta de ontem
        ]),
        porDia([
          ["20260928", "add_to_cart", 8],
          ["20260927", "add_to_cart", 10],
        ]),
        porDia([]),
        {},
        porHora([
          ["20260927", 9, 4],
          ["20260927", 14, 2],
          ["20260927", 20, 4],
        ]),
      ],
      p,
      AGORA,
      { completo: true, vendas: { atual: 2, antes: 4, noPeriodo: 4 } }
    )
    expect(v.ate).toBe(15)
    expect(v.taxas?.sacola).toEqual({ valor: 4.44, antes: 2.09, variacao: 112, de: 8, em: 180 })
    expect(v.taxas?.compraram).toEqual({
      valor: 1.11,
      antes: 1.39,
      variacao: -20,
      de: 2,
      em: 180,
      noPeriodo: 4,
    })
  })

  it("sem comparar e sem visitas, as taxas ficam vazias em vez de dividir por zero", () => {
    const p = lerPeriodo({ periodo: "ontem", comparar: "nenhum" }, AGORA)
    const v = montarVisitasNoPeriodo([{}, {}, {}, {}], p, AGORA, {
      completo: true,
      vendas: { atual: 2, antes: null },
    })
    expect(v.visitas).toEqual({ valor: 0, antes: null, variacao: null })
    expect(v.taxas?.compraram).toEqual({ valor: null, antes: null, variacao: null, de: 2, em: 0 })
    expect(v.barras.every((b) => b.antes === null)).toBe(true)
  })
})
