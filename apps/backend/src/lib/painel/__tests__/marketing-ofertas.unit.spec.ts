import { janelasDo, type Venda } from "../marketing"
import { caixasDos, montarOfertas, type CaixaDoProduto } from "../marketing-ofertas"
import type { ProdutoCru } from "../produtos"

/**
 * As ofertas do Marketing: a caixa de compra de cada produto (quantas
 * unidades ou leve junto), a oferta do checkout pelo código "BUMP-", os
 * cupons pelos outros códigos, e os achados. A hora é de Brasília:
 * 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`)

type Item = { produto: string; unidades?: number; receita: number; ajustes?: [string, number][] }
let n = 0
const venda = (pagoEm: string, itens: Item[], total?: number): Venda => ({
  id: `order_${++n}`,
  pagoEm: em(pagoEm),
  total: total ?? itens.reduce((s, i) => s + i.receita, 0),
  itens: itens.map((i) => ({
    produto: `prod_${i.produto}`,
    handle: i.produto,
    nome: i.produto,
    imagem: null,
    unidades: i.unidades ?? 1,
    receita: i.receita,
    ajustes: (i.ajustes ?? []).map(([codigo, valor]) => ({ codigo, valor })),
  })),
})

const caixas: CaixaDoProduto[] = [
  { id: "prod_fator", handle: "fator", nome: "Fator", imagem: null, modo: "unidades", junto: [] },
  {
    id: "prod_kit",
    handle: "kit",
    nome: "Kit",
    imagem: null,
    modo: "junto",
    junto: ["oleo", "balm"],
  },
  { id: "prod_oleo", handle: "oleo", nome: "Óleo", imagem: null, modo: "unidades", junto: [] },
  { id: "prod_balm", handle: "balm", nome: "Balm", imagem: null, modo: "unidades", junto: [] },
]

describe("a caixa de compra, a oferta do checkout e os cupons", () => {
  const vendas = [
    venda("2026-09-23 10:00", [{ produto: "fator", unidades: 2, receita: 180 }]),
    venda("2026-09-23 11:00", [{ produto: "fator", receita: 90 }]),
    venda("2026-09-22 10:00", [
      { produto: "kit", receita: 120 },
      { produto: "oleo", receita: 60 },
    ]),
    venda("2026-09-22 11:00", [{ produto: "kit", receita: 120 }]),
    venda("2026-09-21 10:00", [
      { produto: "oleo", receita: 60 },
      // A oferta do checkout: o ajuste com o código BUMP-.
      { produto: "balm", receita: 45, ajustes: [["BUMP-BALM-3F9A12C7", 5]] },
    ]),
    venda("2026-09-21 11:00", [{ produto: "fator", receita: 100, ajustes: [["BARBA10", 10]] }], 90),
    venda(
      "2026-09-20 10:00",
      [
        { produto: "kit", receita: 108, ajustes: [["BARBA10", 12]] },
        { produto: "balm", receita: 50 },
      ],
      158
    ),
    // Fora do período.
    venda("2026-09-01 10:00", [{ produto: "fator", unidades: 3, receita: 270 }]),
  ]
  const o = montarOfertas(caixas, vendas, SETE)

  it("quantas unidades: dos pedidos com o produto, os que levaram 2 ou mais", () => {
    expect(o.porProduto.find((p) => p.id === "prod_fator")?.resultado).toEqual({
      modo: "unidades",
      pedidos: 3,
      comMais: 1,
      parte: 33,
    })
  })

  it("leve junto: os pedidos com o produto e um dos de junto, e quanto os de junto somaram", () => {
    const kit = o.porProduto.find((p) => p.id === "prod_kit")
    expect(kit?.junto).toEqual(["Óleo", "Balm"])
    expect(kit?.resultado).toEqual({
      modo: "junto",
      pedidos: 3,
      comJunto: 2,
      parte: 67,
      somou: 110,
    })
  })

  it("os números: as caixas juntas, e a oferta do checkout pelo código BUMP-", () => {
    expect(o.numeros).toEqual({
      // Fator (3 pedidos), Óleo (2) e Balm (2): os três estão em "quantas unidades".
      unidades: { pedidos: 7, comMais: 1, parte: 14 },
      junto: { vezes: 2, somou: 110 },
      checkout: { pedidos: 1, deCada: 7, somou: 45 },
    })
  })

  it("os cupons: os outros códigos, com os usos, o desconto dado e o que os pedidos somaram", () => {
    expect(o.cupons).toEqual([{ codigo: "BARBA10", usos: 2, desconto: 22, vendeu: 248 }])
  })

  it("com poucos pedidos, o achado diz que ainda é cedo", () => {
    expect(o.achados).toEqual([
      expect.objectContaining({ tipo: "info", titulo: "Ainda é pouco pra comparar as ofertas" }),
    ])
  })
})

describe("os achados", () => {
  it("onde os cartões de quantidade funcionam, e quanto a oferta do checkout pega", () => {
    const vendas = [
      ...Array.from({ length: 6 }, (_, i) =>
        venda(`2026-09-2${i % 4} 1${i}:00`, [{ produto: "fator", unidades: 2, receita: 180 }])
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        venda(`2026-09-2${i % 4} 0${i}:00`, [{ produto: "fator", receita: 90 }])
      ),
      venda("2026-09-23 20:00", [
        { produto: "oleo", receita: 60 },
        { produto: "balm", receita: 45, ajustes: [["BUMP-BALM-3F9A12C7", 5]] },
      ]),
    ]
    expect(montarOfertas(caixas, vendas, SETE).achados.map((a) => a.titulo)).toEqual([
      "Fator: os cartões de quantidade funcionam",
      "A oferta do checkout entrou em 1 de cada 13 pedidos",
    ])
  })
})

describe("as caixas", () => {
  it("do fb_pdp de cada produto publicado: o modo e os de junto", () => {
    const produtos: ProdutoCru[] = [
      { id: "prod_kit", handle: "kit", title: "Kit Completo", status: "published" },
      { id: "prod_fator", handle: "fator", title: "Fator de Crescimento", status: "published" },
      { id: "prod_x", handle: "x", title: "Rascunho", status: "draft" },
    ]
    const metadata = new Map<string, unknown>([
      ["prod_kit", { fb_pdp: { combinada: { modo: "junto", produtos: ["oleo", "balm"] } } }],
    ])
    expect(caixasDos(produtos, metadata).map((c) => [c.id, c.modo, c.junto])).toEqual([
      ["prod_fator", "unidades", []],
      ["prod_kit", "junto", ["oleo", "balm"]],
    ])
  })
})
