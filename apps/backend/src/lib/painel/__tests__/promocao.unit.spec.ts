import { DESCONTO_MAXIMO, descontoDe, lerMudancaDePreco, precoDoProduto } from "../promocao"

/**
 * O preço e a promoção do painel: o que chega dos dois campos da lista (e o
 * que é recusado, com o campo que errou), e o preço que a lista mostra — o
 * de hoje, de onde veio a promoção, e a que ficou sem efeito.
 */

const HOJE = { preco: 89.9, promocional: null }

describe("o que chega da lista", () => {
  it("o promocional, em reais, do jeito que a pessoa escreve", () => {
    for (const escrito of ["59,90", "R$ 59,90", "59.90", " 59,9 "])
      expect(lerMudancaDePreco({ promocional: escrito }, HOJE)).toEqual({
        ok: true,
        preco: null,
        promocional: 59.9,
      })
    expect(lerMudancaDePreco({ promocional: 59.9 }, HOJE)).toMatchObject({ promocional: 59.9 })
  })

  it("o promocional vazio tira a promoção; campo que não veio não muda", () => {
    const comPromocao = { preco: 89.9, promocional: 59.9 }
    expect(lerMudancaDePreco({ promocional: "" }, comPromocao)).toEqual({
      ok: true,
      preco: null,
      promocional: null,
    })
    expect(lerMudancaDePreco({ promocional: null }, comPromocao)).toMatchObject({
      promocional: null,
    })
    expect(lerMudancaDePreco({ preco: "99,90" }, comPromocao)).toEqual({
      ok: true,
      preco: 99.9,
      promocional: undefined,
    })
  })

  it("o preço novo; o mesmo de hoje não é mudança", () => {
    expect(lerMudancaDePreco({ preco: "79,90" }, HOJE)).toEqual({
      ok: true,
      preco: 79.9,
      promocional: undefined,
    })
    expect(lerMudancaDePreco({ preco: "89,90" }, HOJE)).toMatchObject({ ok: true, preco: null })
    expect(
      lerMudancaDePreco({ preco: "1.234,50" }, { preco: 999, promocional: null })
    ).toMatchObject({ preco: 1234.5 })
  })

  it("os dois juntos: o par que fica é que conta", () => {
    expect(lerMudancaDePreco({ preco: "119,90", promocional: "49,90" }, HOJE)).toEqual({
      ok: true,
      preco: 119.9,
      promocional: 49.9,
    })
  })

  it("recusa o que não é preço, e diz o campo", () => {
    expect(lerMudancaDePreco({ promocional: "abc" }, HOJE)).toEqual({
      ok: false,
      motivo: "valor_invalido",
      campo: "promocional",
    })
    expect(lerMudancaDePreco({ preco: "0" }, HOJE)).toMatchObject({
      motivo: "valor_invalido",
      campo: "preco",
    })
    expect(lerMudancaDePreco({ preco: "" }, HOJE)).toMatchObject({ motivo: "valor_invalido" })
    expect(lerMudancaDePreco({ preco: { valor: 1 } }, HOJE)).toMatchObject({
      motivo: "valor_invalido",
    })
  })

  it("recusa o promocional que não é desconto, e o dedo errado (mais de 80%)", () => {
    expect(lerMudancaDePreco({ promocional: "89,90" }, HOJE)).toMatchObject({
      motivo: "nao_e_desconto",
      campo: "promocional",
    })
    // "5,99" no lugar de "59,90": 93% de desconto.
    expect(lerMudancaDePreco({ promocional: "5,99" }, HOJE)).toMatchObject({
      motivo: "desconto_demais",
      campo: "promocional",
    })
    expect(descontoDe(89.9, 17.98)).toBe(DESCONTO_MAXIMO)
    expect(lerMudancaDePreco({ promocional: "17,98" }, HOJE)).toMatchObject({ ok: true })
  })

  it("recusa o preço que muda demais de uma vez (8,99 ou 899,00 no lugar de 89,90)", () => {
    expect(lerMudancaDePreco({ preco: "8,99" }, HOJE)).toMatchObject({
      motivo: "mudanca_demais",
      campo: "preco",
    })
    expect(lerMudancaDePreco({ preco: "899,00" }, HOJE)).toMatchObject({
      motivo: "mudanca_demais",
    })
    expect(lerMudancaDePreco({ preco: "17,98" }, HOJE)).toMatchObject({ ok: true })
  })

  it("o preço que passa por baixo da promoção de hoje é recusado no campo do preço", () => {
    const comPromocao = { preco: 89.9, promocional: 59.9 }
    expect(lerMudancaDePreco({ preco: "59,90" }, comPromocao)).toMatchObject({
      motivo: "promocao_acima",
      campo: "preco",
    })
    // Subir o preço e deixar a promoção com mais de 80%: também é o preço.
    expect(
      lerMudancaDePreco({ preco: "349,90" }, { preco: 89.9, promocional: 49.9 })
    ).toMatchObject({
      motivo: "desconto_demais",
      campo: "preco",
    })
    // Mudando os dois, o par novo vale.
    expect(lerMudancaDePreco({ preco: "59,90", promocional: "" }, comPromocao)).toMatchObject({
      ok: true,
      preco: 59.9,
      promocional: null,
    })
  })
})

describe("o preço que a lista mostra", () => {
  it("sem promoção: o preço de hoje", () => {
    expect(precoDoProduto({ de: 89.9, vale: 89.9, doPainel: null })).toEqual({
      promocao: null,
      doPainel: null,
      semEfeito: null,
      hoje: 89.9,
    })
  })

  it("a promoção do painel valendo", () => {
    expect(precoDoProduto({ de: 89.9, vale: 59.9, doPainel: 59.9 })).toEqual({
      promocao: { por: 59.9, desconto: 33, deOutraLista: false },
      doPainel: 59.9,
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

  it("o preço baixou pra menos que a promoção: ela fica sem efeito, e a tela avisa", () => {
    expect(precoDoProduto({ de: 55, vale: 55, doPainel: 59.9 })).toEqual({
      promocao: null,
      doPainel: 59.9,
      semEfeito: 59.9,
      hoje: 55,
    })
  })

  it("sem o preço calculado (o Medusa não respondeu), vale o de hoje; sem preço, nada", () => {
    expect(precoDoProduto({ de: 89.9, vale: null, doPainel: 59.9 }).hoje).toBe(89.9)
    expect(precoDoProduto({ de: null, vale: null, doPainel: null })).toEqual({
      promocao: null,
      doPainel: null,
      semEfeito: null,
      hoje: null,
    })
  })
})
