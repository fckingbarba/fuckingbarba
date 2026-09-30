import {
  aliquotaDoMes,
  ehDia,
  janelaDoMes,
  lerAliquota,
  lerCentavos,
  lerDespesa,
  lerPeriodoDoFinanceiro,
  mesCurto,
  mesesEntre,
  nomeDosMeses,
  porChave,
  somarMeses,
  vigente,
} from "../regras"

/**
 * As regras do Financeiro: os meses, o período da tela, os campos e o valor
 * que vale num dia. A hora é de Brasília: 30/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-30T15:00:00.000Z")

describe("os meses", () => {
  it("somam e subtraem virando o ano", () => {
    expect(somarMeses("2026-09", 1)).toBe("2026-10")
    expect(somarMeses("2026-12", 1)).toBe("2027-01")
    expect(somarMeses("2026-01", -1)).toBe("2025-12")
    expect(somarMeses("2026-09", -12)).toBe("2025-09")
  })

  it("listam de um a outro, os dois dentro", () => {
    expect(mesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"])
    expect(mesesEntre("2026-09", "2026-09")).toEqual(["2026-09"])
    expect(mesesEntre("2026-10", "2026-09")).toEqual([])
  })

  it("têm nome e o mês inteiro em Brasília", () => {
    expect(mesCurto("2026-09")).toBe("Set")
    expect(nomeDosMeses("2026-09", "2026-09")).toBe("setembro de 2026")
    expect(nomeDosMeses("2026-02", "2026-09")).toBe("fevereiro a setembro de 2026")
    expect(nomeDosMeses("2026-11", "2027-01")).toBe("novembro de 2026 a janeiro de 2027")
    const j = janelaDoMes("2026-09")
    expect(j.de.toISOString()).toBe("2026-09-01T03:00:00.000Z")
    expect(j.ate.toISOString()).toBe("2026-10-01T03:00:00.000Z")
  })
})

describe("o período da tela", () => {
  it("sem nada, é este mês comparado com o de antes", () => {
    const p = lerPeriodoDoFinanceiro({}, AGORA)
    expect(p.atalho).toBe("mes")
    expect(p.atual).toMatchObject({ de: "2026-09", ate: "2026-09", nome: "setembro de 2026" })
    expect(p.antes).toMatchObject({ de: "2026-08", ate: "2026-08" })
    expect(p.aviso).toBeNull()
  })

  it("o mês passado e o ano (que começa em fevereiro, sem o de antes)", () => {
    expect(lerPeriodoDoFinanceiro({ periodo: "mes-passado" }, AGORA).atual.de).toBe("2026-08")
    const ano = lerPeriodoDoFinanceiro({ periodo: "ano" }, AGORA)
    expect(ano.atual.meses).toEqual(mesesEntre("2026-02", "2026-09"))
    expect(ano.antes).toBeNull()
  })

  it("os meses escolhidos, com o de antes do mesmo tamanho", () => {
    const p = lerPeriodoDoFinanceiro({ de: "2026-07", ate: "2026-09" }, AGORA)
    expect(p.atalho).toBeNull()
    expect(p.atual.meses).toEqual(["2026-07", "2026-08", "2026-09"])
    expect(p.antes).toMatchObject({ de: "2026-04", ate: "2026-06" })
  })

  it("os meses fora do DRE viram os de dentro, com o aviso", () => {
    const p = lerPeriodoDoFinanceiro({ de: "2025-10", ate: "2027-03" }, AGORA)
    expect(p.atual).toMatchObject({ de: "2026-02", ate: "2026-09" })
    expect(p.aviso).toContain("fevereiro a setembro de 2026")
    // A ordem trocada também vale.
    expect(lerPeriodoDoFinanceiro({ de: "2026-09", ate: "2026-06" }, AGORA).atual.de).toBe(
      "2026-06"
    )
  })

  it("um botão que não existe vira este mês, com o aviso; o comparar some com `nenhum`", () => {
    const p = lerPeriodoDoFinanceiro({ periodo: "semana", comparar: "nenhum" }, AGORA)
    expect(p.atalho).toBe("mes")
    expect(p.aviso).toBe("Mostrando este mês.")
    expect(p.antes).toBeNull()
    expect(p.comparar).toBe(false)
  })

  it("fevereiro não tem o de antes (janeiro fica de fora do DRE)", () => {
    expect(lerPeriodoDoFinanceiro({ de: "2026-02", ate: "2026-02" }, AGORA).antes).toBeNull()
  })
})

describe("os campos", () => {
  it("o valor em reais vira centavos", () => {
    expect(lerCentavos("R$ 9.800,00")).toBe(980000)
    expect(lerCentavos("168")).toBe(16800)
    expect(lerCentavos("3,2")).toBe(320)
    expect(lerCentavos(11.4)).toBe(1140)
    expect(lerCentavos("")).toBeNull()
    expect(lerCentavos("R$")).toBe("invalido")
    expect(lerCentavos("-5")).toBe("invalido")
    expect(lerCentavos("20.000.000")).toBe("invalido")
  })

  it("a alíquota vira centésimos de ponto", () => {
    expect(lerAliquota("6,54")).toBe(654)
    expect(lerAliquota("6,54%")).toBe(654)
    expect(lerAliquota(4)).toBe(400)
    expect(lerAliquota(" ")).toBeNull()
    expect(lerAliquota("0")).toBe("invalido")
    expect(lerAliquota("40")).toBe("invalido")
  })

  it("o dia tem que existir", () => {
    expect(ehDia("2026-02-01")).toBe(true)
    expect(ehDia("2026-02-30")).toBe(false)
    expect(ehDia("2026-2-1")).toBe(false)
  })

  it("a despesa é conferida campo a campo, na ordem da tela", () => {
    const certa = {
      descricao: "  Meta   Ads ",
      categoria: "marketing",
      valor: "9.800",
      mes: "2026-09",
    }
    expect(lerDespesa(certa, AGORA)).toEqual({
      ok: true,
      despesa: {
        descricao: "Meta Ads",
        categoria: "marketing",
        valor: 980000,
        mes: "2026-09",
        repete: false,
      },
    })
    expect(lerDespesa({ ...certa, repete: true }, AGORA)).toMatchObject({
      despesa: { repete: true },
    })
    expect(lerDespesa({ ...certa, descricao: " " }, AGORA)).toEqual({
      ok: false,
      campo: "descricao",
    })
    expect(lerDespesa({ ...certa, categoria: "viagem" }, AGORA)).toEqual({
      ok: false,
      campo: "categoria",
    })
    expect(lerDespesa({ ...certa, valor: "0" }, AGORA)).toEqual({ ok: false, campo: "valor" })
    expect(lerDespesa({ ...certa, mes: "2026-01" }, AGORA)).toEqual({ ok: false, campo: "mes" })
    expect(lerDespesa({ ...certa, mes: "2027-10" }, AGORA)).toEqual({ ok: false, campo: "mes" })
    expect(lerDespesa({ ...certa, mes: "2027-09" }, AGORA).ok).toBe(true)
  })
})

describe("o valor que vale num dia", () => {
  const custos = [
    { desde: "2026-02-01", valor: 1100 },
    { desde: "2026-06-15", valor: 1140 },
  ]

  it("é o mais recente até o dia", () => {
    expect(vigente(custos, "2026-06-14")?.valor).toBe(1100)
    expect(vigente(custos, "2026-06-15")?.valor).toBe(1140)
    expect(vigente(custos, "2026-01-31")).toBeNull()
  })

  it("o Simples do mês é o dele, ou o do último mês que tem (estimado)", () => {
    const simples = [
      { desde: "2026-07-01", valor: 641 },
      { desde: "2026-08-01", valor: 654 },
    ]
    expect(aliquotaDoMes(simples, "2026-08")).toEqual({ valor: 654, certa: true, de: "2026-08" })
    expect(aliquotaDoMes(simples, "2026-09")).toEqual({ valor: 654, certa: false, de: "2026-08" })
    expect(aliquotaDoMes(simples, "2026-06")).toBeNull()
  })

  it("as linhas do banco se agrupam pela chave", () => {
    const m = porChave([
      { chave: "custo:prod_1", desde: "2026-02-01", valor: 1100 },
      { chave: "embalagem", desde: "2026-02-01", valor: 320 },
      { chave: "custo:prod_1", desde: "2026-06-15", valor: 1140 },
    ])
    expect(m.get("custo:prod_1")).toHaveLength(2)
    expect(m.get("embalagem")).toEqual([{ desde: "2026-02-01", valor: 320 }])
  })
})
