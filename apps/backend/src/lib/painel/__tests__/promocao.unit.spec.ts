import { DESCONTO_MAXIMO, descontoDe, lerPromocao, precoDoProduto } from "../promocao"

/**
 * A promoção do painel: o valor que chega da tela (e o que é recusado), e o
 * preço que a lista mostra — o de hoje, de onde veio a promoção, e a que
 * ficou sem efeito.
 */

describe("o valor da promoção", () => {
  it("em reais, do jeito que a pessoa escreve", () => {
    expect(lerPromocao("59,90", 89.9)).toEqual({ ok: true, por: 59.9 })
    expect(lerPromocao("R$ 59,90", 89.9)).toEqual({ ok: true, por: 59.9 })
    expect(lerPromocao("59.90", 89.9)).toEqual({ ok: true, por: 59.9 })
    expect(lerPromocao(" 64 ", 89.9)).toEqual({ ok: true, por: 64 })
    expect(lerPromocao("1.234,50", 1500)).toEqual({ ok: true, por: 1234.5 })
    expect(lerPromocao(59.9, 89.9)).toEqual({ ok: true, por: 59.9 })
  })

  it("vazio tira a promoção", () => {
    expect(lerPromocao(null, 89.9)).toEqual({ ok: true, por: null })
    expect(lerPromocao("", 89.9)).toEqual({ ok: true, por: null })
    expect(lerPromocao("   ", 89.9)).toEqual({ ok: true, por: null })
  })

  it("recusa o que não é preço, o que não é desconto e o desconto grande demais", () => {
    expect(lerPromocao("abc", 89.9)).toEqual({ ok: false, motivo: "valor_invalido" })
    expect(lerPromocao("0", 89.9)).toEqual({ ok: false, motivo: "valor_invalido" })
    expect(lerPromocao("-10", 89.9)).toEqual({ ok: false, motivo: "valor_invalido" })
    expect(lerPromocao({ por: 1 }, 89.9)).toEqual({ ok: false, motivo: "valor_invalido" })
    expect(lerPromocao("89,90", 89.9)).toEqual({ ok: false, motivo: "nao_e_desconto" })
    expect(lerPromocao("99,90", 89.9)).toEqual({ ok: false, motivo: "nao_e_desconto" })
    // "5,99" no lugar de "59,90": 93% de desconto.
    expect(lerPromocao("5,99", 89.9)).toEqual({ ok: false, motivo: "desconto_demais" })
    expect(descontoDe(89.9, 17.98)).toBe(DESCONTO_MAXIMO)
    expect(lerPromocao("17,98", 89.9)).toEqual({ ok: true, por: 17.98 })
  })
})

describe("o preço que a lista mostra", () => {
  it("sem promoção: o do Bling", () => {
    expect(precoDoProduto({ de: 89.9, vale: 89.9, doPainel: null })).toEqual({
      promocao: null,
      semEfeito: null,
      hoje: 89.9,
    })
  })

  it("a promoção do painel valendo", () => {
    expect(precoDoProduto({ de: 89.9, vale: 59.9, doPainel: 59.9 })).toEqual({
      promocao: { por: 59.9, desconto: 33, deOutraLista: false },
      semEfeito: null,
      hoje: 59.9,
    })
  })

  it("a promoção de outra lista (a de lançamento, uma do admin) aparece, e diz de onde veio", () => {
    expect(precoDoProduto({ de: 78.9, vale: 53.9, doPainel: null }).promocao).toEqual({
      por: 53.9,
      desconto: 32,
      deOutraLista: true,
    })
    // As duas com preço: vale a menor, e ela não é a do painel.
    expect(precoDoProduto({ de: 78.9, vale: 53.9, doPainel: 59.9 }).promocao?.deOutraLista).toBe(
      true
    )
  })

  it("o Bling baixou o preço pra menos que a promoção: ela fica sem efeito, e a tela avisa", () => {
    expect(precoDoProduto({ de: 55, vale: 55, doPainel: 59.9 })).toEqual({
      promocao: null,
      semEfeito: 59.9,
      hoje: 55,
    })
  })

  it("sem o preço calculado (o Medusa não respondeu), vale o do Bling; sem preço, nada", () => {
    expect(precoDoProduto({ de: 89.9, vale: null, doPainel: 59.9 }).hoje).toBe(89.9)
    expect(precoDoProduto({ de: null, vale: null, doPainel: null })).toEqual({
      promocao: null,
      semEfeito: null,
      hoje: null,
    })
  })
})
