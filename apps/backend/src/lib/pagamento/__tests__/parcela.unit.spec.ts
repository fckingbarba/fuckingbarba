import { parcelaCabe } from "../parcela"

/**
 * A porta da parcela mínima da loja (0157): cada parcela tem que passar da
 * mínima das Configurações. À vista e o Pix nem passam por ela.
 */
describe("a parcela cabe na mínima da loja", () => {
  it("R$ 90 em 3x são 3 de R$ 30: cabe numa mínima de R$ 30, não numa de R$ 30,01", () => {
    expect(parcelaCabe(9000, 3, 30)).toBe(true)
    expect(parcelaCabe(9000, 3, 30.01)).toBe(false)
  })

  it("com a mínima do banco (R$ 5), o de sempre: R$ 14,99 em 3x não cabe", () => {
    expect(parcelaCabe(1500, 3, 5)).toBe(true)
    expect(parcelaCabe(1499, 3, 5)).toBe(false)
  })

  it("à vista sempre cabe — a mínima é de parcela, não de compra", () => {
    expect(parcelaCabe(100, 1, 1000)).toBe(true)
    expect(parcelaCabe(100, 0, 1000)).toBe(true)
  })
})
