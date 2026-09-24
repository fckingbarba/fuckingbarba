import {
  comparacaoComOntem,
  fusoDa,
  handleDaPagina,
  handlesDe,
  horasDoDia,
  maisVistosDe,
  montarVisitas,
  nomeDaOrigem,
  origensDe,
  perguntasDoDia,
  soONumero,
  veOBlocoDasVisitas,
  type RelatorioGa4,
} from "../visitas"

/**
 * As visitas do Início, lidas das respostas do GA4 (o formato da API de
 * dados do Google: `rows[].dimensionValues[].value` e `metricValues[].value`,
 * tudo texto). A hora é de Brasília: 24/09/2026, 12:10 aqui = 15:10 UTC.
 */

const AGORA = new Date("2026-09-24T15:10:00.000Z")

const linha = (dimensoes: string[], valor: number) => ({
  dimensionValues: dimensoes.map((value) => ({ value })),
  metricValues: [{ value: String(valor) }],
})
const relatorio = (rows: ReturnType<typeof linha>[]): RelatorioGa4 => ({ rows })

describe("as perguntas", () => {
  it("três relatórios: por hora (ontem e hoje), de onde vieram e as páginas de produto", () => {
    const [horas, origens, paginas] = perguntasDoDia()
    // "today"/"yesterday": o Google resolve no fuso da propriedade, não no do servidor.
    expect(horas.dateRanges).toEqual([{ startDate: "yesterday", endDate: "today" }])
    expect(origens.dateRanges).toEqual([{ startDate: "today", endDate: "today" }])
    expect(horas.dimensions.map((d) => d.name)).toEqual(["date", "hour"])
    expect(origens.dimensions.map((d) => d.name)).toEqual(["sessionSource", "sessionMedium"])
    expect(paginas.dimensionFilter?.filter.stringFilter.value).toBe("/produtos/")
  })
})

describe("hora a hora", () => {
  const horas = relatorio([
    linha(["20260924", "00"], 6),
    linha(["20260924", "09"], 17),
    linha(["20260924", "12"], 4),
    linha(["20260923", "09"], 20),
    linha(["20260923", "12"], 30),
    linha(["20260923", "18"], 99),
  ])

  it("as 24 horas do dia pedido, e só dele", () => {
    const hoje = horasDoDia(horas, "2026-09-24")
    expect(hoje).toHaveLength(24)
    expect(hoje[0] + hoje[9] + hoje[12]).toBe(27)
    expect(horasDoDia(horas, "2026-09-23")[18]).toBe(99)
  })
})

describe("hoje contra ontem — só nas horas que o Google já somou", () => {
  const dia = (valores: Record<number, number>) => {
    const horas = Array<number>(24).fill(0)
    for (const [h, v] of Object.entries(valores)) horas[Number(h)] = v
    return horas
  }
  const ONTEM = dia({ 0: 5, 7: 20, 8: 30, 9: 40, 10: 50, 11: 60 })

  it("em dia: até a hora de agora, sem ela (que está pela metade)", () => {
    const hoje = dia({ 0: 4, 7: 18, 8: 25, 9: 44, 10: 51, 11: 7 })
    expect(comparacaoComOntem(hoje, ONTEM, 11)).toEqual({ ate: 11, hoje: 142, ontem: 145 })
    // A hora de agora ainda vazia (o Google na anterior): em dia do mesmo jeito.
    expect(comparacaoComOntem(dia({ 0: 4, 10: 51 }), ONTEM, 11)?.ate).toBe(11)
  })

  it("atrasado (24/09: −92% num dia normal): só até a última hora que chegou, sem ela", () => {
    // 11h, e o Google só somou até as 8h: compara 0h–7h59 dos dois dias.
    const hoje = dia({ 0: 4, 7: 12, 8: 3 })
    expect(comparacaoComOntem(hoje, ONTEM, 11)).toEqual({ ate: 8, hoje: 16, ontem: 25 })
  })

  it("sem nenhuma hora inteira somada, não compara", () => {
    expect(comparacaoComOntem(dia({ 0: 3 }), ONTEM, 5)).toBeNull()
    expect(comparacaoComOntem(dia({}), ONTEM, 11)).toBeNull()
    expect(comparacaoComOntem(dia({ 0: 3 }), ONTEM, 0)).toBeNull()
  })
})

describe("o fuso da propriedade", () => {
  it("o que a resposta disser — ou Brasília, se não disser ou for um que não existe", () => {
    expect(fusoDa({ metadata: { timeZone: "America/Los_Angeles" } })).toBe("America/Los_Angeles")
    expect(fusoDa({})).toBe("America/Sao_Paulo")
    expect(fusoDa({ metadata: { timeZone: "Marte/Olympus" } })).toBe("America/Sao_Paulo")
  })
})

describe("de onde vieram", () => {
  it("os nomes que o dono reconhece", () => {
    expect(nomeDaOrigem("l.instagram.com", "referral")).toBe("Instagram")
    expect(nomeDaOrigem("ig", "social")).toBe("Instagram")
    expect(nomeDaOrigem("lm.facebook.com", "referral")).toBe("Facebook")
    expect(nomeDaOrigem("google", "organic")).toBe("Google")
    expect(nomeDaOrigem("google", "cpc")).toBe("Google")
    expect(nomeDaOrigem("(direct)", "(none)")).toBe("Direto")
    expect(nomeDaOrigem("resend", "email")).toBe("E-mail")
    expect(nomeDaOrigem("chatgpt.com", "referral")).toBe("Assistentes de IA")
    expect(nomeDaOrigem("(not set)", "(not set)")).toBe("Sem origem")
    expect(nomeDaOrigem("www.barbeariadojoao.com.br", "referral")).toBe("barbeariadojoao.com.br")
  })

  it("somadas por nome, as maiores primeiro, e o resto junto em “Outros”", () => {
    const r = relatorio([
      linha(["l.instagram.com", "referral"], 100),
      linha(["instagram", "social"], 88),
      linha(["google", "organic"], 115),
      linha(["(direct)", "(none)"], 70),
      linha(["resend", "email"], 21),
      linha(["bing", "organic"], 10),
      linha(["barbearia.com", "referral"], 8),
    ])
    expect(origensDe(r)).toEqual([
      { nome: "Instagram", visitas: 188 },
      { nome: "Google", visitas: 115 },
      { nome: "Direto", visitas: 70 },
      { nome: "E-mail", visitas: 21 },
      { nome: "Outros", visitas: 18 },
    ])
  })
})

describe("os produtos mais vistos", () => {
  it("só a página do produto: nem a lista, nem a ordem, nem outra página", () => {
    expect(handleDaPagina("/produtos/oleo-para-barba")).toBe("oleo-para-barba")
    expect(handleDaPagina("/produtos/oleo-para-barba/")).toBe("oleo-para-barba")
    expect(handleDaPagina("/produtos/ordem/preco")).toBeNull()
    expect(handleDaPagina("/produtos/ordem")).toBeNull()
    expect(handleDaPagina("/produtos")).toBeNull()
    expect(handleDaPagina("/barba")).toBeNull()
  })

  it("com o nome do Medusa — e o do endereço, pro que o Medusa não conhece", () => {
    const r = relatorio([
      linha(["/produtos/fator-de-crescimento"], 120),
      linha(["/produtos/fator-de-crescimento/"], 11),
      linha(["/produtos/kit-viagem"], 74),
      linha(["/produtos/ordem/preco"], 500),
    ])
    expect(handlesDe(r)).toEqual(["fator-de-crescimento", "kit-viagem"])
    const nomes = new Map([["fator-de-crescimento", "Fator de Crescimento"]])
    expect(maisVistosDe(r, nomes)).toEqual([
      { nome: "Fator de Crescimento", visitas: 131 },
      { nome: "Kit viagem", visitas: 74 },
    ])
  })
})

describe("o dia montado", () => {
  const respostas = {
    horas: relatorio([
      linha(["20260924", "08"], 9),
      linha(["20260924", "12"], 3),
      linha(["20260923", "08"], 10),
    ]),
    origens: relatorio([linha(["google", "organic"], 12)]),
    paginas: relatorio([]),
    agora: relatorio([linha([], 4)]),
  }

  it("o número, a comparação, a hora a hora até agora, ontem e quem está no site", () => {
    const v = montarVisitas(respostas, { agora: AGORA, nomes: new Map() })
    expect(v.hoje).toBe(12)
    expect(v.comparacao).toEqual({ ate: 12, hoje: 9, ontem: 10 })
    expect(v.porHora).toHaveLength(13)
    expect(v.porHora[8]).toBe(9)
    expect(v.ontem).toBe(10)
    expect(v.agora).toBe(4)
    expect(v.maisVistos).toEqual([])
  })

  it("no fuso da propriedade: em Los Angeles, 12:10 de Brasília ainda são 8h10", () => {
    const em = (timeZone: string) => ({
      ...respostas,
      horas: { ...respostas.horas, metadata: { timeZone } },
    })
    const v = montarVisitas(em("America/Los_Angeles"), { agora: AGORA, nomes: new Map() })
    expect(v.porHora).toHaveLength(9)
    expect(v.comparacao).toEqual({ ate: 8, hoje: 0, ontem: 0 })
  })

  it("a operação recebe só o número; o dono e o marketing, o bloco", () => {
    const v = montarVisitas(respostas, { agora: AGORA, nomes: new Map() })
    expect(soONumero(v)).toEqual({ hoje: 12, comparacao: { ate: 12, hoje: 9, ontem: 10 } })
    expect(veOBlocoDasVisitas("operacao")).toBe(false)
    expect(veOBlocoDasVisitas("dono")).toBe(true)
    expect(veOBlocoDasVisitas("marketing")).toBe(true)
  })

  it("resposta vazia (dia sem ninguém, ou o GA4 recém-ligado) não quebra", () => {
    const v = montarVisitas(
      { horas: {}, origens: { rows: null }, paginas: {}, agora: {} },
      { agora: AGORA, nomes: new Map() }
    )
    expect([v.hoje, v.ontem, v.agora, v.comparacao]).toEqual([0, 0, 0, null])
    expect(v.origens).toEqual([])
  })
})
