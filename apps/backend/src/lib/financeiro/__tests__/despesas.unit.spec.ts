import {
  despesasNosMeses,
  entraNoMes,
  planoDaMudanca,
  planoDoApagar,
  type DespesaGravada,
} from "../despesas"
import type { DespesaLida } from "../regras"
import { mesDasDespesas, telaDasDespesas } from "../tela-das-despesas"

/**
 * As despesas no tempo: a de um mês só, a que repete (até parar), mudar o
 * valor dali em diante sem mexer nos meses de antes, e a tela do mês.
 */

const AGORA = new Date("2026-09-30T15:00:00.000Z")

const umaVez: DespesaGravada = {
  id: "fdes_1",
  descricao: "Meta Ads",
  categoria: "marketing",
  valor: 980000,
  mes: "2026-09",
  repete: false,
  ate: null,
}
const todoMes: DespesaGravada = {
  id: "fdes_2",
  descricao: "Vercel",
  categoria: "plataforma",
  valor: 16800,
  mes: "2026-06",
  repete: true,
  ate: null,
}
const nova = (campos: Partial<DespesaLida> = {}): DespesaLida => ({
  descricao: "Vercel",
  categoria: "plataforma",
  valor: 21000,
  mes: "2026-09",
  repete: true,
  ...campos,
})

describe("em que mês a despesa entra", () => {
  it("a de um mês só, no dela; a que repete, do primeiro até parar", () => {
    expect(entraNoMes(umaVez, "2026-09")).toBe(true)
    expect(entraNoMes(umaVez, "2026-10")).toBe(false)
    expect(entraNoMes(todoMes, "2026-05")).toBe(false)
    expect(entraNoMes(todoMes, "2026-06")).toBe(true)
    expect(entraNoMes(todoMes, "2027-06")).toBe(true)
    expect(entraNoMes({ ...todoMes, ate: "2026-08" }, "2026-09")).toBe(false)
  })

  it("cada despesa em cada mês", () => {
    const r = despesasNosMeses([umaVez, todoMes], ["2026-08", "2026-09"])
    expect(r).toEqual([
      { mes: "2026-08", categoria: "plataforma", descricao: "Vercel", valor: 16800 },
      { mes: "2026-09", categoria: "marketing", descricao: "Meta Ads", valor: 980000 },
      { mes: "2026-09", categoria: "plataforma", descricao: "Vercel", valor: 16800 },
    ])
  })
})

describe("mudar", () => {
  it("a de um mês só muda inteira, e pode ir pra outro mês", () => {
    expect(planoDaMudanca(umaVez, "2026-09", nova({ repete: false, mes: "2026-08" }))).toEqual({
      mudar: {
        id: "fdes_1",
        campos: {
          descricao: "Vercel",
          categoria: "plataforma",
          valor: 21000,
          mes: "2026-08",
          repete: false,
          ate: null,
        },
      },
    })
  })

  it("a que repete, vista no primeiro mês, muda inteira", () => {
    expect(planoDaMudanca(todoMes, "2026-06", nova())).toEqual({
      mudar: {
        id: "fdes_2",
        campos: {
          descricao: "Vercel",
          categoria: "plataforma",
          valor: 21000,
          repete: true,
          ate: null,
        },
      },
    })
  })

  it("a que repete, vista depois, fecha no mês de antes e continua com o valor novo", () => {
    expect(planoDaMudanca(todoMes, "2026-09", nova())).toEqual({
      mudar: { id: "fdes_2", campos: { ate: "2026-08" } },
      criar: {
        descricao: "Vercel",
        categoria: "plataforma",
        valor: 21000,
        mes: "2026-09",
        repete: true,
        ate: null,
      },
    })
  })

  it("tirar o 'repete' deixa só o mês em que mudou", () => {
    const p = planoDaMudanca(todoMes, "2026-09", nova({ repete: false }))
    expect(p.mudar).toEqual({ id: "fdes_2", campos: { ate: "2026-08" } })
    expect(p.criar).toMatchObject({ mes: "2026-09", repete: true, ate: "2026-09" })
  })
})

describe("apagar", () => {
  it("a de um mês só some", () => {
    expect(planoDoApagar(umaVez, "2026-09")).toEqual({ apagar: "fdes_1" })
  })

  it("a que repete some inteira no primeiro mês, e depois para no mês de antes", () => {
    expect(planoDoApagar(todoMes, "2026-06")).toEqual({ apagar: "fdes_2" })
    expect(planoDoApagar(todoMes, "2026-09")).toEqual({
      mudar: { id: "fdes_2", campos: { ate: "2026-08" } },
    })
  })
})

describe("a tela do mês", () => {
  const taxas: DespesaGravada = {
    id: "fdes_3",
    descricao: "Nuvem Pago, 1 a 26/09",
    categoria: "taxas",
    valor: 211840,
    mes: "2026-09",
    repete: false,
    ate: null,
  }

  it("agrupa por categoria, na ordem das categorias, com o total", () => {
    const t = telaDasDespesas([taxas, todoMes, umaVez], "2026-09", AGORA, ["2026-08", "2026-09"])
    expect(t.nome).toBe("setembro de 2026")
    expect(t.grupos.map((g) => g.nome)).toEqual([
      "Marketing e anúncios",
      "Plataforma e sistemas",
      "Taxas de pagamento",
    ])
    expect(t.grupos[2]).toMatchObject({ linha: "Despesas variáveis", total: 2118.4 })
    expect(t.grupos[1].itens[0]).toMatchObject({
      valor: 168,
      repete: true,
      desde: "2026-06",
      ate: null,
    })
    expect(t.total).toBe(9800 + 168 + 2118.4)
    expect(t.anterior).toBe("2026-08")
    expect(t.proximo).toBe("2026-10")
  })

  it("marca, antes da loja nova, o mês que vendeu sem a taxa ou o frete lançado", () => {
    const t = telaDasDespesas([taxas], "2026-09", AGORA, ["2026-08", "2026-09"])
    expect(t.antesDaLojaNova.map((m) => m.curto)).toEqual([
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
    ])
    expect(t.antesDaLojaNova.at(-1)).toEqual({
      mes: "2026-09",
      curto: "Set",
      vendeu: true,
      taxas: true,
      frete: false,
    })
    expect(t.antesDaLojaNova[0]).toMatchObject({ vendeu: false, taxas: false })
  })

  it("o mês do endereço vai do começo do DRE a um ano depois", () => {
    expect(mesDasDespesas("2026-07", AGORA)).toBe("2026-07")
    expect(mesDasDespesas("2026-01", AGORA)).toBe("2026-09")
    expect(mesDasDespesas("2027-10", AGORA)).toBe("2026-09")
    expect(mesDasDespesas(undefined, AGORA)).toBe("2026-09")
    expect(telaDasDespesas([], "2026-02", AGORA, []).anterior).toBeNull()
  })
})
