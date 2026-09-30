import {
  AJUSTES_PADRAO,
  CHAVE_DOS_AJUSTES,
  lerAjustesGuardados,
  lerMudancaDosAjustes,
  montarTelaDosAjustes,
  soOQueMudou,
} from "../ajustes"

/**
 * Os Ajustes do CRM: o guardado por cima do padrão (tolerante), o que o
 * painel manda (estrito, com a frase de cada campo), só o que mudou indo pro
 * metadata, e a tela com o que conta como cada tipo de produto.
 */

const FORMULARIO = {
  dias: { fator: "40", oleo: "70", shampoo: "65", balm: "80", spray: "45", pasta: "60" },
  regras: {
    toleranciaDaReposicao: "10",
    semPrevisao: "60",
    sunset: "45",
    quente: "30",
    morno: "90",
    comprasDoCupom: "3",
  },
}

describe("o que está guardado", () => {
  it("sem nada: o padrão", () => {
    expect(lerAjustesGuardados(undefined)).toEqual(AJUSTES_PADRAO)
    expect(lerAjustesGuardados({ fb_home: {} })).toEqual(AJUSTES_PADRAO)
  })

  it("o guardado por cima do padrão; o que não serve volta pro padrão", () => {
    const lido = lerAjustesGuardados({
      [CHAVE_DOS_AJUSTES]: {
        dias: { fator: 40, oleo: 0, balm: "90", pasta: "muito" },
        regras: { sunset: 30, comprasDoCupom: 99 },
      },
    })
    expect(lido.dias).toEqual({ ...AJUSTES_PADRAO.dias, fator: 40, balm: 90 })
    expect(lido.regras).toEqual({ ...AJUSTES_PADRAO.regras, sunset: 30 })
  })

  it("o morno antes do quente não existe: os dois voltam pro padrão", () => {
    const lido = lerAjustesGuardados({ [CHAVE_DOS_AJUSTES]: { regras: { quente: 120 } } })
    expect(lido.regras.quente).toBe(30)
    expect(lido.regras.morno).toBe(90)
  })
})

describe("o que o painel manda", () => {
  it("o formulário inteiro, em texto: vira número", () => {
    const r = lerMudancaDosAjustes(FORMULARIO)
    expect(r).toEqual({
      ajustes: {
        dias: { ...AJUSTES_PADRAO.dias, fator: 40 },
        regras: { ...AJUSTES_PADRAO.regras, toleranciaDaReposicao: 10 },
      },
    })
  })

  it("cada campo errado volta com a frase, e nada passa", () => {
    const r = lerMudancaDosAjustes({
      dias: { ...FORMULARIO.dias, fator: "0", oleo: "4,5", shampoo: "" },
      regras: { ...FORMULARIO.regras, sunset: "2", comprasDoCupom: "11" },
    })
    expect(r).toEqual({
      erros: {
        "dias.fator": "Um número de 1 a 365.",
        "dias.oleo": "Um número de 1 a 365.",
        "dias.shampoo": "Um número de 1 a 365.",
        "regras.sunset": "Um número de 7 a 365.",
        "regras.comprasDoCupom": "Um número de 1 a 10.",
      },
    })
    expect(lerMudancaDosAjustes(null)).toHaveProperty("erros")
  })

  it("o morno vai até depois do quente", () => {
    const r = lerMudancaDosAjustes({
      ...FORMULARIO,
      regras: { ...FORMULARIO.regras, quente: "60", morno: "60" },
    })
    expect(r).toEqual({ erros: { "regras.morno": "Maior que o do quente (60)." } })
  })
})

describe("o que vai pro metadata", () => {
  it("só o diferente do padrão; tudo igual, nada", () => {
    expect(
      soOQueMudou({
        dias: { ...AJUSTES_PADRAO.dias, fator: 40 },
        regras: { ...AJUSTES_PADRAO.regras, quente: 15 },
      })
    ).toEqual({ dias: { fator: 40 }, regras: { quente: 15 } })
    expect(soOQueMudou(AJUSTES_PADRAO)).toBeNull()
  })
})

describe("a tela", () => {
  it("cada tipo com os produtos que contam como ele; o resto, fora da conta", () => {
    const tela = montarTelaDosAjustes(AJUSTES_PADRAO, [
      { titulo: "Óleo para Barba 30ml", handle: "oleo-para-barba" },
      { titulo: "Kit 3 Fator de Crescimento", handle: "kit-3-fator-de-crescimento-para-barba" },
      { titulo: "Fator de Crescimento", handle: "fator-de-crescimento-para-barba" },
      {
        titulo: "Kit Fator + Shampoo",
        handle: "kit-fator-de-crescimento-para-barba-e-shampoo",
      },
      { titulo: "Camiseta", handle: "camiseta-da-loja" },
    ])
    expect(tela.tipos.map((t) => t.nome)).toEqual([
      "Fator de Crescimento",
      "Óleo",
      "Shampoo",
      "Balm",
      "Spray",
      "Pasta",
    ])
    expect(tela.tipos[0].produtos).toEqual([
      "Fator de Crescimento",
      "Kit 3 Fator de Crescimento (3 unidades)",
      "Kit Fator + Shampoo",
    ])
    expect(tela.tipos[2].produtos).toEqual(["Kit Fator + Shampoo"])
    expect(tela.foraDaConta).toEqual(["Camiseta"])
    expect(tela.padrao).toEqual(AJUSTES_PADRAO)
  })
})
