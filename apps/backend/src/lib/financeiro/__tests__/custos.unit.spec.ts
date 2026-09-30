import { porChave } from "../regras"
import { lerCustos, telaDosCustos, type ProdutoLido } from "../tela-dos-custos"

/**
 * Custos e imposto: o custo que vale hoje (com o de antes), o que sobra de
 * uma unidade, a embalagem, a alíquota de cada mês e o formulário conferido.
 * A hora é de Brasília: 30/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-30T15:00:00.000Z")

const PRODUTOS: ProdutoLido[] = [
  { id: "prod_spray", nome: "Spray Matte", foto: null, publicado: true, preco: 49.9 },
  { id: "prod_rascunho", nome: "Amostra", foto: null, publicado: false, preco: null },
  { id: "prod_oleo", nome: "Óleo", foto: "/oleo.webp", publicado: true, preco: 54.9 },
]

const VALORES = porChave([
  { chave: "custo:prod_oleo", desde: "2026-02-01", valor: 1100 },
  { chave: "custo:prod_oleo", desde: "2026-09-15", valor: 1140 },
  { chave: "custo:prod_oleo", desde: "2026-12-01", valor: 1200 },
  { chave: "embalagem", desde: "2026-02-01", valor: 320 },
  { chave: "simples", desde: "2026-07-01", valor: 641 },
  { chave: "simples", desde: "2026-08-01", valor: 654 },
])

describe("a tela de custos", () => {
  const t = telaDosCustos(PRODUTOS, VALORES, AGORA)

  it("o custo de hoje, com o de antes; o do futuro ainda não vale", () => {
    const oleo = t.produtos.find((p) => p.id === "prod_oleo")!
    expect(oleo).toMatchObject({ custo: 11.4, desde: "2026-09-15", sobra: 43.5, sobraPct: 79.2 })
    expect(oleo.antes).toEqual([{ valor: 11, desde: "2026-02-01" }])
  })

  it("os publicados primeiro, pelo nome; conta quem está sem custo", () => {
    expect(t.produtos.map((p) => p.nome)).toEqual(["Óleo", "Spray Matte", "Amostra"])
    expect(t.produtos[1]).toMatchObject({ custo: null, sobra: null, desde: null })
    expect(t.semCusto).toBe(1)
  })

  it("a embalagem e o Simples de cada mês (o que falta diz qual usa)", () => {
    expect(t.embalagem).toEqual({ valor: 3.2, desde: "2026-02-01" })
    expect(t.hoje).toBe("2026-09-30")
    expect(t.comeco).toBe("2026-02-01")
    expect(t.simples[0]).toEqual({
      mes: "2026-09",
      nome: "setembro de 2026",
      valor: null,
      usa: "6,54% (a de agosto)",
    })
    expect(t.simples[1]).toMatchObject({ mes: "2026-08", valor: 6.54, usa: null })
    expect(t.simples.at(-1)).toEqual({
      mes: "2026-02",
      nome: "fevereiro de 2026",
      valor: null,
      usa: null,
    })
  })
})

describe("o formulário de custos", () => {
  const ids = new Set(PRODUTOS.map((p) => p.id))

  it("cada custo vira um valor desde o dia, e a embalagem também", () => {
    expect(
      lerCustos(
        {
          custos: [
            { produto: "prod_spray", valor: "9,80", desde: "2026-02-01" },
            { produto: "prod_oleo", valor: "", desde: "2026-09-15" },
          ],
          embalagem: { valor: "3,50", desde: "2026-10-01" },
        },
        ids,
        AGORA
      )
    ).toEqual({
      ok: true,
      valores: [
        { chave: "custo:prod_spray", desde: "2026-02-01", valor: 980 },
        { chave: "custo:prod_oleo", desde: "2026-09-15", valor: null },
        { chave: "embalagem", desde: "2026-10-01", valor: 350 },
      ],
    })
  })

  it("recusa o produto que não existe, o valor e o dia que não valem", () => {
    expect(
      lerCustos({ custos: [{ produto: "prod_x", valor: "1", desde: "2026-02-01" }] }, ids, AGORA)
    ).toEqual({
      ok: false,
      campo: "produto",
      produto: "prod_x",
    })
    expect(
      lerCustos(
        { custos: [{ produto: "prod_oleo", valor: "abc", desde: "2026-02-01" }] },
        ids,
        AGORA
      )
    ).toMatchObject({ ok: false, campo: "valor" })
    expect(
      lerCustos({ custos: [{ produto: "prod_oleo", valor: "1", desde: "2026-02-30" }] }, ids, AGORA)
    ).toMatchObject({ ok: false, campo: "desde" })
    expect(lerCustos({ embalagem: { valor: "1", desde: "2028-01-01" } }, ids, AGORA)).toMatchObject(
      { ok: false, campo: "desde", produto: null }
    )
  })

  it("sem nada, não grava nada", () => {
    expect(lerCustos({}, ids, AGORA)).toEqual({ ok: true, valores: [] })
  })
})
