import { descontosAutomaticos, fraseDasFaixas } from "../cupons"

/** Os descontos que a loja aplica sozinha, em frase. */

describe("os descontos automáticos", () => {
  it("as faixas de quantidade", () => {
    expect(
      fraseDasFaixas([
        { unidades: 2, ate: 2, desconto: 4 },
        { unidades: 3, ate: null, desconto: 6 },
      ])
    ).toBe(
      '4% levando 2 do mesmo produto; 6% levando 3 ou mais. O total arredonda pra baixo até o ",90".'
    )
  })

  it("a oferta do checkout conta os pedidos da semana; o frete sai da política", () => {
    const [, oferta, frete] = descontosAutomaticos({
      frete: { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null },
      oferta: { aceitas: 1, pedidos: 6 },
    })
    expect(oferta.texto).toMatch(/Entrou em 1 de 6 pedidos pagos nos últimos 7 dias\.$/)
    expect(frete).toMatchObject({
      titulo: "Frete grátis",
      texto: "Em pedidos a partir de R$ 149,90 em produtos, na opção mais barata da cotação.",
      valendo: true,
    })
    const [, , sem] = descontosAutomaticos({
      frete: { modo: "nenhuma" },
      oferta: { aceitas: 0, pedidos: 0 },
    })
    expect(sem.valendo).toBe(false)
  })
})
