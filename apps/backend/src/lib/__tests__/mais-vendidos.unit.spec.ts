import {
  itensDaBase,
  JANELA_DIAS,
  ordemDosMaisVendidos,
  type PedidoPago,
  type ProdutoVendavel,
} from "../mais-vendidos"

/** Parte do catálogo de 28/09, com o SKU do Bling de cada um. */
const CATALOGO: ProdutoVendavel[] = [
  { handle: "balm-para-barba", skus: ["FBBM01"] },
  { handle: "oleo-para-barba", skus: ["FBOL01"] },
  { handle: "shampoo-para-barba", skus: ["FBSH01"] },
  { handle: "kit-completo-para-barba", skus: ["FBKIT01"] },
  { handle: "fator-de-crescimento-para-barba", skus: ["FBFCB01"] },
  { handle: "kit-3-fator-de-crescimento-para-barba", skus: ["FBKIT06"] },
]

const pedido = (...itens: PedidoPago["itens"]): PedidoPago => ({ itens })
const sku = (s: string, unidades = 1) => ({ sku: s, unidades })
const vezes = (n: number, p: PedidoPago) => Array.from({ length: n }, () => p)

describe("ordemDosMaisVendidos", () => {
  it("põe na frente o que vendeu mais unidades", () => {
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        ...vezes(3, pedido(sku("FBKIT01"))),
        pedido(sku("FBFCB01", 2)),
        pedido(sku("FBFCB01", 3), sku("FBSH01")),
      ])
    ).toEqual(["fator-de-crescimento-para-barba", "kit-completo-para-barba", "shampoo-para-barba"])
  })

  it("no empate de unidades, ganha quem esteve em mais pedidos; depois, o endereço", () => {
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        pedido(sku("FBOL01", 2)),
        pedido(sku("FBBM01")),
        pedido(sku("FBBM01")),
        pedido(sku("FBSH01", 2)),
      ])
    ).toEqual(["balm-para-barba", "oleo-para-barba", "shampoo-para-barba"])
  })

  it("a ordem não depende da ordem dos pedidos", () => {
    const pedidos = [
      pedido(sku("FBOL01", 2)),
      pedido(sku("FBSH01", 2)),
      pedido(sku("FBKIT01", 5)),
      pedido(sku("FBBM01", 2)),
    ]
    const certa = ordemDosMaisVendidos(CATALOGO, pedidos)
    expect(ordemDosMaisVendidos(CATALOGO, [...pedidos].reverse())).toEqual(certa)
    expect(certa).toEqual([
      "kit-completo-para-barba",
      "balm-para-barba",
      "oleo-para-barba",
      "shampoo-para-barba",
    ])
  })

  it("o SKU acha o produto de hoje — sem ligar pra maiúscula e espaço — e manda mais que o endereço", () => {
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        pedido({ sku: " fbkit06 ", unidades: 2 }),
        // O endereço antigo de um produto que mudou de endereço: vale o SKU.
        pedido({ sku: "FBOL01", handle: "oleo-antigo", unidades: 1 }),
      ])
    ).toEqual(["kit-3-fator-de-crescimento-para-barba", "oleo-para-barba"])
  })

  it("sem SKU que case, vale o endereço — se o produto estiver publicado", () => {
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        pedido({ handle: "balm-para-barba", unidades: 1 }),
        pedido({ sku: "SEM-CADASTRO", handle: "shampoo-para-barba", unidades: 2 }),
        pedido({ sku: "FBPMT01", handle: "pasta-que-saiu-do-site", unidades: 9 }),
        pedido({ sku: null, handle: null, unidades: 4 }),
      ])
    ).toEqual(["shampoo-para-barba", "balm-para-barba"])
  })

  it("o mesmo produto duas vezes no pedido soma as unidades e conta um pedido só", () => {
    // Óleo: 3 unidades num pedido. Shampoo: 3 unidades em dois. Empate nas
    // unidades; o shampoo esteve em mais pedidos.
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        pedido(sku("FBOL01"), sku("FBOL01", 2)),
        pedido(sku("FBSH01", 2)),
        pedido(sku("FBSH01")),
      ])
    ).toEqual(["shampoo-para-barba", "oleo-para-barba"])
  })

  it("unidade zero, negativa ou sem número não conta", () => {
    expect(
      ordemDosMaisVendidos(CATALOGO, [
        pedido(sku("FBOL01", 0)),
        pedido(sku("FBBM01", -2)),
        pedido(sku("FBSH01", Number.NaN)),
        pedido(sku("FBKIT01", 1.7)),
      ])
    ).toEqual(["kit-completo-para-barba"])
  })

  it("produto sem venda fica de fora, e sem venda nenhuma a lista é vazia", () => {
    const ordem = ordemDosMaisVendidos(CATALOGO, [pedido(sku("FBSH01"))])
    expect(ordem).toEqual(["shampoo-para-barba"])
    expect(ordemDosMaisVendidos(CATALOGO, [])).toEqual([])
    expect(ordemDosMaisVendidos([], [pedido(sku("FBSH01"))])).toEqual([])
  })

  it("junta a Nuvemshop e a loja nova, cada uma com o seu jeito de dizer o produto", () => {
    const daNuvemshop = [
      { itens: itensDaBase([{ sku: "FBKIT01", nome: "Kit", quantidade: 1, valor: 114.9 }]) },
      { itens: itensDaBase([{ sku: "FBKIT01", nome: "Kit", quantidade: 1, valor: 114.9 }]) },
      { itens: itensDaBase([{ sku: "FBFCB01", nome: "Fator", quantidade: 1, valor: 89.9 }]) },
    ]
    const doMedusa = [
      pedido({ sku: "FBFCB01", handle: "fator-de-crescimento-para-barba", unidades: 3 }),
    ]
    expect(ordemDosMaisVendidos(CATALOGO, [...daNuvemshop, ...doMedusa])).toEqual([
      "fator-de-crescimento-para-barba",
      "kit-completo-para-barba",
    ])
  })

  it("olha os últimos 90 dias", () => {
    expect(JANELA_DIAS).toBe(90)
  })
})

describe("itensDaBase", () => {
  it("fica com o SKU e as unidades de cada item", () => {
    expect(
      itensDaBase([
        { sku: "FBSH01", nome: "Shampoo", quantidade: 2, valor: 49.9 },
        { sku: "FBOL01", nome: "Óleo", quantidade: 1, valor: 65.9 },
      ])
    ).toEqual([
      { sku: "FBSH01", unidades: 2 },
      { sku: "FBOL01", unidades: 1 },
    ])
  })

  it("item sem SKU, sem quantidade ou torto fica de fora", () => {
    expect(
      itensDaBase([
        { sku: null, nome: "Brinde", quantidade: 1, valor: 0 },
        { sku: "   ", nome: "Sem código", quantidade: 1, valor: 10 },
        { sku: "FBBM01", nome: "Balm", quantidade: 0, valor: 59.9 },
        { sku: "FBBM01", nome: "Balm", valor: 59.9 },
        null,
        "FBBM01",
        { sku: "FBBM01", nome: "Balm", quantidade: "2", valor: 59.9 },
      ])
    ).toEqual([{ sku: "FBBM01", unidades: 2 }])
  })

  it("o que não é lista vira lista vazia", () => {
    expect(itensDaBase(null)).toEqual([])
    expect(itensDaBase(undefined)).toEqual([])
    expect(itensDaBase({ sku: "FBSH01", quantidade: 1 })).toEqual([])
  })
})
