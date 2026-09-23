import { FAIXAS, totalDaFaixa, unitarioDaFaixa } from "../precos-por-quantidade"

/** Os preços do catálogo em 22/09 (o que o cliente paga, com a promoção). */
const OLEO = 54.9
const BALM = 53.9
const SHAMPOO = 49.9
const FATOR = 79.9
const KIT = 99.9

describe("o total da faixa", () => {
  it("2 unidades: 4% a menos, pra baixo até o ,90", () => {
    // 2 x 79,90 = 159,80; menos 4% = 153,408 → R$ 152,90 (R$ 76,45 cada)
    expect(totalDaFaixa(FATOR, 2, 4)).toBe(15290)
    expect(unitarioDaFaixa(FATOR, 2, 4)).toBe(76.45)
    // 2 x 54,90 = 109,80; menos 4% = 105,408 → R$ 104,90
    expect(totalDaFaixa(OLEO, 2, 4)).toBe(10490)
  })

  it("3 unidades: só fecha o ,90 que o 3 divide em centavos", () => {
    // 3 x 79,90 = 239,70; menos 6% = 225,318. R$ 224,90 e R$ 223,90 não
    // dividem por 3 em centavos; R$ 222,90 dá R$ 74,30 cada.
    expect(totalDaFaixa(FATOR, 3, 6)).toBe(22290)
    expect(unitarioDaFaixa(FATOR, 3, 6)).toBe(74.3)
    // 3 x 54,90 = 164,70; menos 6% = 154,818 → R$ 153,90 já divide (51,30)
    expect(totalDaFaixa(OLEO, 3, 6)).toBe(15390)
  })

  it("todo total termina em ,90 e divide exato pelas unidades", () => {
    for (const preco of [OLEO, BALM, SHAMPOO, FATOR, KIT, 12.9, 199.9, 349.9]) {
      for (const faixa of FAIXAS) {
        const total = totalDaFaixa(preco, faixa.unidades, faixa.desconto)
        expect(total).not.toBeNull()
        expect(total! % 100).toBe(90)
        expect(total! % faixa.unidades).toBe(0)
      }
    }
  })

  it("nunca dá menos desconto que o anunciado, e nunca mais que R$ 3,00 além dele", () => {
    for (const preco of [OLEO, BALM, SHAMPOO, FATOR, KIT, 12.9, 199.9, 349.9]) {
      for (const faixa of FAIXAS) {
        const cheio = Math.round(preco * 100) * faixa.unidades
        const exato = (cheio * (100 - faixa.desconto)) / 100
        const total = totalDaFaixa(preco, faixa.unidades, faixa.desconto)!
        expect(total).toBeLessThanOrEqual(exato)
        expect(exato - total).toBeLessThan(300)
      }
    }
  })

  it("sem vantagem não há faixa: o arredondamento não pode encarecer", () => {
    // R$ 0,50 x 2 = R$ 1,00; com 4% = R$ 0,96 → R$ 0,90, ainda mais barato
    // que os dois avulsos: a faixa vale.
    expect(totalDaFaixa(0.5, 2, 4)).toBe(90)
    // R$ 0,30 x 2 = R$ 0,60: nenhum ,90 cabe embaixo — a faixa some.
    expect(totalDaFaixa(0.3, 2, 4)).toBeNull()
    expect(unitarioDaFaixa(0.3, 2, 4)).toBeNull()
  })
})
