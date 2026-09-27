import { lerPagina, paginar, POR_PAGINA } from "../paginas"

/**
 * As listas do painel em páginas: o número do endereço, o recorte e a
 * página que não existe.
 */

const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe("lerPagina", () => {
  it("lê o número do endereço", () => {
    expect(lerPagina("1")).toBe(1)
    expect(lerPagina("7")).toBe(7)
    expect(lerPagina(" 12 ")).toBe(12)
  })

  it("o que não é página vira a primeira", () => {
    for (const v of [undefined, null, "", "0", "-2", "2.5", "abc", "1e3", ["2"], 3, "9999999"]) {
      expect(lerPagina(v)).toBe(1)
    }
  })
})

describe("paginar", () => {
  it("recorta de 30 em 30, e conta a lista inteira", () => {
    const { itens, paginacao } = paginar(lista(75), 2)
    expect(itens).toEqual(lista(60).slice(30))
    expect(paginacao).toEqual({ pagina: 2, paginas: 3, porPagina: POR_PAGINA, itens: 75 })
  })

  it("a última página leva o que sobra", () => {
    const { itens, paginacao } = paginar(lista(75), 3)
    expect(itens).toEqual([61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75])
    expect(paginacao.pagina).toBe(3)
  })

  it("a página que não existe vira a última", () => {
    const { itens, paginacao } = paginar(lista(35), 9)
    expect(itens).toEqual([31, 32, 33, 34, 35])
    expect(paginacao).toEqual({ pagina: 2, paginas: 2, porPagina: 30, itens: 35 })
  })

  it("a lista vazia tem uma página, vazia", () => {
    expect(paginar([], 4)).toEqual({
      itens: [],
      paginacao: { pagina: 1, paginas: 1, porPagina: 30, itens: 0 },
    })
  })

  it("aceita outro tamanho de página", () => {
    const { itens, paginacao } = paginar(lista(120), 2, 50)
    expect(itens[0]).toBe(51)
    expect(itens).toHaveLength(50)
    expect(paginacao.paginas).toBe(3)
  })
})
