import type { PrevisaoDaPessoa } from "../../crm/previsao"
import { montarTelaDaPrevisao, type PessoaDaPrevisao } from "../previsao"

/** A aba Previsão (0220): os números, as duas listas e a busca, com o e-mail mascarado. */

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date("2026-09-29T15:00:00Z")
const daqui = (n: number) => new Date(AGORA.getTime() + n * DIA)
const pessoa = (
  email: string,
  proxima: number | null,
  chance: "baixa" | "media" | "alta",
  ticket: number,
  ate: number,
  extra: Partial<PessoaDaPrevisao> = {}
): PessoaDaPrevisao => ({
  email,
  nome: null,
  clienteId: null,
  previsao: {
    compras: 2,
    ritmo: null,
    proximaCompra: { em: proxima === null ? null : daqui(proxima), porque: "" },
    chance: { valor: chance, porque: "o porquê" },
    ltv: { ate, previsto: ticket * 2, ticket, porque: "" },
  } satisfies PrevisaoDaPessoa,
  ...extra,
})

describe("a tela da previsão", () => {
  const pessoas = [
    pessoa("ana@x.com", 2, "baixa", 100, 300, { nome: "Ana", clienteId: "cus_1" }),
    pessoa("bia@x.com", 6, "media", 200, 400),
    pessoa("caio@x.com", 20, "baixa", 80, 160),
    pessoa("dani@x.com", -30, "alta", 150, 900, { nome: "Dani" }),
    pessoa("eva@x.com", -50, "alta", 90, 1200),
    pessoa("fabio@x.com", null, "media", 60, 60),
  ]
  const tela = montarTelaDaPrevisao({ pessoas, agora: AGORA })

  it("os números: 7 e 30 dias com o ticket, a chance, o que está em jogo e o LTV", () => {
    expect(tela.numeros).toEqual({
      clientes: 6,
      semana: { pessoas: 2, valor: 300 },
      mes: { pessoas: 3, valor: 380 },
      chance: { baixa: 2, media: 2, alta: 2 },
      emJogo: 2100,
      ltvMedio: 503.33,
      previsto: 1360,
    })
  })

  it("as listas: a semana pelo ticket; os de chance alta pelo que já gastaram — com o e-mail mascarado", () => {
    expect(tela.semana.map((l) => l.quem)).toEqual(["b•••@x.com", "Ana · a•••@x.com"])
    expect(tela.semana[1]).toMatchObject({ clienteId: "cus_1", nomeDaChance: "Baixa" })
    expect(tela.emRisco.map((l) => l.quem)).toEqual(["e•••@x.com", "Dani · d•••@x.com"])
    expect(tela.busca).toBeNull()
  })

  it("a busca: o e-mail que alguém digitou volta inteiro; quem não comprou, sem linha", () => {
    const achou = montarTelaDaPrevisao({ pessoas, agora: AGORA, busca: "dani@x.com" })
    expect(achou.busca).toMatchObject({ email: "dani@x.com", linha: { quem: "Dani · dani@x.com" } })
    const nada = montarTelaDaPrevisao({ pessoas, agora: AGORA, busca: "zeca@x.com" })
    expect(nada.busca).toEqual({ email: "zeca@x.com", linha: null })
  })
})
