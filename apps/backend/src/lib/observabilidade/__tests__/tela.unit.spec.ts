import { OBSERVABILIDADE } from "../../../modules/observabilidade"
import { ROTINAS } from "../../painel/observabilidade"
import { gravesAbertos } from "../tela"

/**
 * O número vermelho do menu (`gravesAbertos`, que o `GET /dashboard/eu`
 * devolve): o total que o banco conta, com o papel no filtro — nunca as
 * linhas de uma página. Até a 0167 ele lia 100 linhas e contava as que o
 * papel via: com 110 graves abertos, o menu dizia 100 e a tela, 110.
 */

// 25/09/2026, 21:10 em Brasília.
const AGORA = new Date("2026-09-26T00:10:00Z")
const min = (n: number) => new Date(AGORA.getTime() - n * 60_000)

type Linha = { id: string; situacao: string; nivel: string; so_dono: boolean }

let n = 0
const linhas = (quantas: number, extra: Partial<Linha> = {}): Linha[] =>
  Array.from({ length: quantas }, () => ({
    id: `prob_${++n}`,
    situacao: "aberto",
    nivel: "grave",
    so_dono: false,
    ...extra,
  }))

// 110 graves abertos (3 são estornos, só do dono), e o que não entra na conta.
const PROBLEMAS = [
  ...linhas(107),
  ...linhas(3, { so_dono: true }),
  ...linhas(20, { nivel: "atencao" }),
  ...linhas(15, { situacao: "resolvido" }),
]

/**
 * O módulo de mentira, com as duas leituras do Medusa: filtram por igualdade,
 * como o banco; o `listProblemas` devolve a página (`take`), e o
 * `listAndCountProblemas`, a página e o total. As rotinas rodaram todas em
 * `ultimaRodada`.
 */
function container(problemas: Linha[], ultimaRodada: Date) {
  const filtros: Record<string, unknown>[] = []
  const achar = (filtro: Record<string, unknown>) => {
    filtros.push(filtro)
    return problemas.filter((p) =>
      Object.entries(filtro).every(([campo, valor]) => p[campo as keyof Linha] === valor)
    )
  }
  const obs = {
    listProblemas: async (filtro: Record<string, unknown>, config: { take?: number }) =>
      achar(filtro).slice(0, config.take),
    listAndCountProblemas: async (filtro: Record<string, unknown>, config: { take?: number }) => {
      const achados = achar(filtro)
      return [achados.slice(0, config.take), achados.length]
    },
    listRotinas: async () =>
      ROTINAS.map((r) => ({ nome: r.nome, ultima_inicio: ultimaRodada, ultima_situacao: "ok" })),
  }
  const c = {
    resolve: (chave: string) => {
      if (chave !== OBSERVABILIDADE) throw new Error(`sem ${chave}`)
      return obs
    },
  }
  return { c: c as never, filtros }
}

describe("o número vermelho do menu", () => {
  it("passa de 100: é o total do banco, e não o tamanho de uma página", async () => {
    const { c, filtros } = container(PROBLEMAS, min(0.5))
    expect(await gravesAbertos(c, "dono", AGORA)).toBe(110)
    expect(filtros).toEqual([{ situacao: "aberto", nivel: "grave" }])
  })

  it("quem não é o dono não conta o estorno, e o filtro vai pro banco", async () => {
    const { c, filtros } = container(PROBLEMAS, min(0.5))
    expect(await gravesAbertos(c, "operacao", AGORA)).toBe(107)
    expect(await gravesAbertos(c, "marketing", AGORA)).toBe(107)
    expect(filtros).toEqual([
      { situacao: "aberto", nivel: "grave", so_dono: false },
      { situacao: "aberto", nivel: "grave", so_dono: false },
    ])
  })

  it("com as rotinas paradas, soma o aviso delas, que não mora na tabela", async () => {
    const { c } = container(PROBLEMAS, min(40))
    expect(await gravesAbertos(c, "dono", AGORA)).toBe(111)
    expect(await gravesAbertos(c, "operacao", AGORA)).toBe(108)
    expect(await gravesAbertos(container([], min(40)).c, "operacao", AGORA)).toBe(1)
    expect(await gravesAbertos(container([], min(0.5)).c, "dono", AGORA)).toBe(0)
  })
})
