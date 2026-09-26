import { janelasDo, type Venda } from "../marketing"
import {
  catalogoDos,
  montarProdutos,
  perguntaDosProdutos,
  type ProdutoDoCatalogo,
} from "../marketing-produtos"
import type { ProdutoCru } from "../produtos"
import type { RelatorioGa4 } from "../visitas"

/**
 * Os produtos do Marketing: a pergunta ao GA4 (só as variantes da loja), o
 * catálogo, a soma das variantes por produto, a sacola, os sinais e o
 * achado. A hora é de Brasília: 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`)

const produto = (id: string, c: Partial<ProdutoDoCatalogo> = {}): ProdutoDoCatalogo => ({
  id,
  handle: id,
  nome: id.toUpperCase(),
  imagem: null,
  publicado: true,
  variantes: [`variant_${id}`],
  estoque: 50,
  ...c,
})

const venda = (
  pagoEm: string,
  itens: { produto: string; unidades: number; receita: number }[]
): Venda => ({
  id: `order_${pagoEm}`,
  pagoEm: em(pagoEm),
  total: itens.reduce((s, i) => s + i.receita, 0),
  itens: itens.map((i) => ({
    ...i,
    handle: i.produto,
    nome: i.produto,
    imagem: null,
    ajustes: [],
  })),
})

const ga = (linhas: [string, number, number][]): RelatorioGa4 => ({
  rows: linhas.map(([id, vistas, sacola]) => ({
    dimensionValues: [{ value: id }],
    metricValues: [{ value: String(vistas) }, { value: String(sacola) }],
  })),
})

describe("a pergunta e o catálogo", () => {
  it("as vezes vista e posta na sacola, só das variantes da loja nova", () => {
    expect(perguntaDosProdutos("7d")).toEqual({
      dateRanges: [{ startDate: "6daysAgo", endDate: "today" }],
      dimensions: [{ name: "itemId" }],
      metrics: [{ name: "itemsViewed" }, { name: "itemsAddedToCart" }],
      dimensionFilter: {
        filter: {
          fieldName: "itemId",
          stringFilter: { matchType: "BEGINS_WITH", value: "variant_" },
        },
      },
      limit: "1000",
    })
  })

  it("o catálogo: o nome curto, as variantes, se está no site e o estoque", () => {
    const crus: ProdutoCru[] = [
      {
        id: "prod_1",
        handle: "oleo-para-barba",
        title: "Óleo para Barba — 30ml",
        status: "published",
        thumbnail: "https://x/oleo.webp",
        variants: [{ id: "variant_a" }, { id: "variant_b" }],
      },
      { id: "prod_2", handle: "rascunho", title: "Rascunho", status: "draft", variants: [] },
      { id: "prod_3", title: "Sem endereço", status: "published" },
    ]
    expect(catalogoDos(crus, new Map([["prod_1", 12]]))).toEqual([
      {
        id: "prod_1",
        handle: "oleo-para-barba",
        nome: "Óleo",
        imagem: "https://x/oleo.webp",
        publicado: true,
        variantes: ["variant_a", "variant_b"],
        estoque: 12,
      },
      {
        id: "prod_2",
        handle: "rascunho",
        nome: "Rascunho",
        imagem: null,
        publicado: false,
        variantes: [],
        estoque: null,
      },
    ])
  })
})

describe("a lista", () => {
  const catalogo = [
    produto("a", { variantes: ["variant_a1", "variant_a2"] }),
    produto("b", { estoque: 0 }),
    produto("c", { estoque: 5 }),
    produto("d", { publicado: false, estoque: null }),
    // Fora do site e sem venda no período: fora da lista.
    produto("e", { publicado: false }),
  ]
  const vendas = [
    venda("2026-09-23 10:00", [{ produto: "a", unidades: 2, receita: 100 }]),
    venda("2026-09-22 10:00", [{ produto: "c", unidades: 1, receita: 50 }]),
    venda("2026-09-21 10:00", [{ produto: "d", unidades: 1, receita: 30 }]),
    // Fora do período.
    venda("2026-09-01 10:00", [{ produto: "b", unidades: 9, receita: 900 }]),
  ]
  const respostas = ga([
    ["variant_a1", 200, 10],
    ["variant_a2", 100, 5],
    ["variant_b", 100, 20],
    ["variant_c", 50, 10],
    // Variante que o catálogo não conhece (apagada): fica de fora.
    ["variant_zz", 999, 999],
  ])

  it("soma as variantes de cada produto, com a sacola, o vendido e os sinais", () => {
    const { produtos } = montarProdutos(catalogo, vendas, SETE, respostas)
    expect(
      produtos.map((p) => [p.id, p.visitas, p.sacola, p.vendidos, p.receita, p.sinais])
    ).toEqual([
      ["a", 300, 5, 2, 100, ["pouca-sacola"]],
      ["c", 50, 20, 1, 50, ["acabando"]],
      ["d", 0, null, 1, 30, ["vendendo"]],
      ["b", 100, 20, 0, 0, ["esgotado"]],
    ])
  })

  it("o achado: o muito visto que pouca gente põe na sacola, e quanto seria na média", () => {
    expect(montarProdutos(catalogo, vendas, SETE, respostas).achado).toEqual({
      tipo: "oportunidade",
      titulo: "A: muita visita, pouca sacola",
      texto:
        "A página foi vista 300 vezes e só 5% virou sacola — a média dos outros é 20%. Se chegasse " +
        "nela, seriam uns 45 a mais na sacola no período. Vale revisar a página: as fotos, o texto e " +
        "o que aparece abaixo do preço.",
    })
  })

  it("sem o Google: as visitas e a sacola em branco, sem achado; o vendido e o estoque seguem", () => {
    const { produtos, achado } = montarProdutos(catalogo, vendas, SETE, null)
    expect(produtos[0]).toMatchObject({
      id: "a",
      visitas: null,
      sacola: null,
      sinais: ["vendendo"],
    })
    expect(produtos.find((p) => p.id === "b")?.sinais).toEqual(["esgotado"])
    expect(achado).toBeNull()
  })

  it("com pouca visita, o achado diz que ainda é cedo", () => {
    const { achado } = montarProdutos(catalogo, vendas, SETE, ga([["variant_a1", 40, 4]]))
    expect(achado).toMatchObject({ tipo: "info", titulo: "Ainda é pouco pra comparar os produtos" })
  })
})
