import {
  baldeDoDia,
  baldeDoInstante,
  baldesDo,
  diasEntre,
  janelasNoCorte,
  lerDesde,
  lerPeriodo,
  MAXIMO_DE_DIAS,
  pediuPeriodo,
} from "../periodo"

/**
 * O período do Início (0186): os botões, as datas escolhidas, o de antes e os
 * baldes do gráfico. A hora é de Brasília: 28/09/2026 (uma segunda), 15:40
 * aqui = 18:40 UTC.
 */

const AGORA = new Date("2026-09-28T18:40:00.000Z")
/** A meia-noite de um dia em Brasília, como instante. */
const meiaNoite = (dia: string) => new Date(`${dia}T03:00:00.000Z`)
/** Um instante em Brasília: "2026-09-24 10:30". */
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`)

describe("o período dos botões", () => {
  it("sem nada, hoje contra ontem até a mesma hora", () => {
    const p = lerPeriodo({}, AGORA)
    expect(p).toMatchObject({
      atalho: "hoje",
      de: "2026-09-28",
      ate: "2026-09-28",
      dias: ["2026-09-28"],
      ateAgora: true,
      passo: "hora",
      nome: "Hoje",
      datas: "segunda-feira, 28/09",
      nomeDoAntes: "ontem",
      aviso: null,
    })
    expect(p.atual).toEqual({ de: meiaNoite("2026-09-28"), ate: AGORA })
    expect(p.antes).toEqual({
      de: "2026-09-27",
      ate: "2026-09-27",
      dias: ["2026-09-27"],
      janela: { de: meiaNoite("2026-09-27"), ate: em("2026-09-27 15:40") },
    })
  })

  it("ontem é o dia inteiro, contra anteontem inteiro", () => {
    const p = lerPeriodo({ periodo: "ontem" }, AGORA)
    expect(p).toMatchObject({ de: "2026-09-27", ate: "2026-09-27", ateAgora: false, passo: "hora" })
    expect(p.atual).toEqual({ de: meiaNoite("2026-09-27"), ate: meiaNoite("2026-09-28") })
    expect(p.antes?.janela).toEqual({ de: meiaNoite("2026-09-26"), ate: meiaNoite("2026-09-27") })
    expect(p.nomeDoAntes).toBe("26/09")
    expect(p.datas).toBe("domingo, 27/09")
  })

  it("7 dias: os 6 de antes e hoje até agora; o de antes termina na mesma hora", () => {
    const p = lerPeriodo({ periodo: "7d" }, AGORA)
    expect(p.dias).toEqual(diasEntre("2026-09-22", "2026-09-28"))
    expect(p).toMatchObject({ passo: "dia", nome: "Últimos 7 dias", datas: "22/09 a 28/09" })
    expect(p.antes).toMatchObject({ de: "2026-09-15", ate: "2026-09-21" })
    expect(p.antes?.janela).toEqual({ de: meiaNoite("2026-09-15"), ate: em("2026-09-21 15:40") })
    expect(p.nomeDoAntes).toBe("15/09 a 21/09")
  })

  it("30 dias, do mesmo jeito", () => {
    const p = lerPeriodo({ periodo: "30d" }, AGORA)
    expect([p.de, p.ate, p.dias.length]).toEqual(["2026-08-30", "2026-09-28", 30])
    expect([p.antes?.de, p.antes?.ate]).toEqual(["2026-07-31", "2026-08-29"])
  })

  it("este mês, contra o mês passado até o mesmo dia e hora", () => {
    const p = lerPeriodo({ periodo: "mes" }, AGORA)
    expect([p.de, p.ate, p.nome]).toEqual(["2026-09-01", "2026-09-28", "Este mês"])
    expect(p.antes?.janela).toEqual({ de: meiaNoite("2026-08-01"), ate: em("2026-08-28 15:40") })
    expect(p.nomeDoAntes).toBe("01/08 a 28/08")
  })

  it("este mês no dia 31, contra um mês mais curto: o de antes vai até o fim dele", () => {
    const p = lerPeriodo({ periodo: "mes" }, new Date("2026-03-31T15:00:00.000Z"))
    expect([p.antes?.de, p.antes?.ate]).toEqual(["2026-02-01", "2026-02-28"])
  })

  it("o mês passado inteiro, contra o mês antes dele", () => {
    const p = lerPeriodo({ periodo: "mes-passado" }, AGORA)
    expect(p).toMatchObject({
      de: "2026-08-01",
      ate: "2026-08-31",
      ateAgora: false,
      nome: "Agosto",
      nomeDoAntes: "julho",
    })
    expect(p.atual).toEqual({ de: meiaNoite("2026-08-01"), ate: meiaNoite("2026-09-01") })
    expect(p.antes?.janela).toEqual({ de: meiaNoite("2026-07-01"), ate: meiaNoite("2026-08-01") })
  })

  it("não comparar: sem o de antes", () => {
    const p = lerPeriodo({ periodo: "7d", comparar: "nenhum" }, AGORA)
    expect(p.antes).toBeNull()
    expect(p.nomeDoAntes).toBeNull()
  })

  it("botão que não existe vira hoje (sem aviso: é endereço velho, não erro de quem escolheu)", () => {
    expect(lerPeriodo({ periodo: "90d" }, AGORA)).toMatchObject({ atalho: "hoje", aviso: null })
  })

  it("só com algum parâmetro o período entra na resposta (o painel de antes não manda nenhum)", () => {
    expect(pediuPeriodo({})).toBe(false)
    expect(pediuPeriodo({ periodo: "" })).toBe(false)
    expect(pediuPeriodo({ periodo: "hoje" })).toBe(true)
    expect(pediuPeriodo({ de: "2026-09-01" })).toBe(true)
  })
})

describe("as datas que a pessoa escolhe", () => {
  it("de 14 a 20/09, contra os 7 dias logo antes", () => {
    const p = lerPeriodo({ de: "2026-09-14", ate: "2026-09-20" }, AGORA)
    expect(p).toMatchObject({
      atalho: null,
      de: "2026-09-14",
      ate: "2026-09-20",
      ateAgora: false,
      passo: "dia",
      nome: "14/09 a 20/09",
      nomeDoAntes: "07/09 a 13/09",
      aviso: null,
    })
    expect(p.atual).toEqual({ de: meiaNoite("2026-09-14"), ate: meiaNoite("2026-09-21") })
  })

  it("até hoje: vai até agora, e o de antes para na mesma hora", () => {
    const p = lerPeriodo({ de: "2026-09-25", ate: "2026-09-28" }, AGORA)
    expect(p.ateAgora).toBe(true)
    expect(p.atual.ate).toEqual(AGORA)
    expect(p.antes?.janela).toEqual({ de: meiaNoite("2026-09-21"), ate: em("2026-09-24 15:40") })
  })

  it("um dia só vai hora a hora, com o ano quando não é o de hoje", () => {
    const p = lerPeriodo({ de: "2025-12-24", ate: "2025-12-24" }, AGORA)
    expect(p).toMatchObject({ passo: "hora", nome: "24/12/2025", nomeDoAntes: "23/12/2025" })
  })

  it("trocadas, desviram; o fim depois de hoje para em hoje", () => {
    expect(lerPeriodo({ de: "2026-09-20", ate: "2026-09-14" }, AGORA)).toMatchObject({
      de: "2026-09-14",
      ate: "2026-09-20",
    })
    expect(lerPeriodo({ de: "2026-09-26", ate: "2026-10-05" }, AGORA)).toMatchObject({
      de: "2026-09-26",
      ate: "2026-09-28",
      ateAgora: true,
    })
  })

  it("o que não vale vira hoje, com o porquê", () => {
    const aviso = (busca: Record<string, string>) => lerPeriodo(busca, AGORA)
    expect(aviso({ de: "2026-02-31", ate: "2026-03-02" })).toMatchObject({
      atalho: "hoje",
      aviso: "As datas não valem — mostrando hoje.",
    })
    expect(aviso({ de: "2026-10-01", ate: "2026-10-02" }).aviso).toMatch(/depois de hoje/)
    expect(aviso({ de: "2019-01-01", ate: "2019-01-02" }).aviso).toMatch(/antiga/)
    expect(aviso({ de: "2026-01-01", ate: "2026-09-28" }).aviso).toMatch(/6 meses/)
  })

  it("seis meses cabem; a data sozinha vale como um dia", () => {
    const fim = "2026-09-28"
    const comeco = new Date(Date.parse(`${fim}T12:00:00Z`) - (MAXIMO_DE_DIAS - 1) * 864e5)
      .toISOString()
      .slice(0, 10)
    expect(lerPeriodo({ de: comeco, ate: fim }, AGORA)).toMatchObject({
      aviso: null,
      passo: "semana",
    })
    expect(lerPeriodo({ de: "2026-09-10" }, AGORA)).toMatchObject({
      de: "2026-09-10",
      ate: "2026-09-10",
    })
  })
})

describe("os baldes do gráfico", () => {
  it("um dia vai hora a hora; o de agora diz 'agora'", () => {
    const b = baldesDo(lerPeriodo({}, AGORA), AGORA)
    expect(b).toHaveLength(24)
    expect(b.map((x) => x.rotulo).filter(Boolean)).toEqual(["0h", "6h", "12h", "agora", "18h"])
    expect(b.findIndex((x) => x.agora)).toBe(15)
    expect(baldesDo(lerPeriodo({ periodo: "ontem" }, AGORA), AGORA).some((x) => x.agora)).toBe(
      false
    )
  })

  it("7 dias, dia a dia, com o dia da semana; o último é hoje", () => {
    const b = baldesDo(lerPeriodo({ periodo: "7d" }, AGORA), AGORA)
    expect(b.map((x) => x.rotulo)).toEqual([
      "ter 22",
      "qua 23",
      "qui 24",
      "sex 25",
      "sáb 26",
      "dom 27",
      "hoje",
    ])
    expect(b[0].nome).toBe("22/09")
  })

  it("mais de 62 dias, de semana em semana contando de trás pra frente", () => {
    const p = lerPeriodo({ de: "2026-06-21", ate: "2026-09-28" }, AGORA) // 100 dias
    const b = baldesDo(p, AGORA)
    expect(b).toHaveLength(15) // 14 semanas inteiras e uma de 2 dias, a mais velha
    expect(b[0].nome).toBe("21/06 a 22/06")
    expect(b[14]).toMatchObject({ nome: "22/09 a 28/09", agora: true, rotulo: "esta" })
    expect(baldeDoDia(p, "2026-06-22", 0)).toBe(0)
    expect(baldeDoDia(p, "2026-06-23", 0)).toBe(1)
    expect(baldeDoDia(p, "2026-09-28", 0)).toBe(14)
  })

  it("o de antes cai no balde da mesma posição", () => {
    const p = lerPeriodo({ periodo: "7d" }, AGORA)
    expect(baldeDoDia(p, "2026-09-15", 10, true)).toBe(0)
    expect(baldeDoDia(p, "2026-09-21", 10, true)).toBe(6)
    expect(baldeDoDia(p, "2026-09-21", 10)).toBe(-1) // não é do período
    expect(baldeDoInstante(p, em("2026-09-28 09:00"))).toBe(6)
    const hoje = lerPeriodo({}, AGORA)
    expect(baldeDoInstante(hoje, em("2026-09-28 09:59"))).toBe(9)
    expect(baldeDoInstante(hoje, em("2026-09-27 22:10"), true)).toBe(22)
  })
})

describe("o corte do Google e a leitura", () => {
  it("chegando até agora, as duas janelas param na hora que o Google já somou", () => {
    const p = lerPeriodo({ periodo: "7d" }, AGORA)
    expect(janelasNoCorte(p, 13)).toEqual({
      atual: { de: meiaNoite("2026-09-22"), ate: em("2026-09-28 13:00") },
      antes: { de: meiaNoite("2026-09-15"), ate: em("2026-09-21 13:00") },
    })
    expect(janelasNoCorte(p, null)).toEqual({ atual: p.atual, antes: p.antes!.janela })
  })

  it("período que já acabou não tem corte", () => {
    const p = lerPeriodo({ periodo: "ontem" }, AGORA)
    expect(janelasNoCorte(p, 13)).toEqual({ atual: p.atual, antes: p.antes!.janela })
  })

  it("os pedidos são lidos desde o começo do de antes, com três dias de folga", () => {
    expect(lerDesde(lerPeriodo({ periodo: "7d" }, AGORA))).toEqual(meiaNoite("2026-09-12"))
    expect(lerDesde(lerPeriodo({ periodo: "7d", comparar: "nenhum" }, AGORA))).toEqual(
      meiaNoite("2026-09-19")
    )
  })
})
