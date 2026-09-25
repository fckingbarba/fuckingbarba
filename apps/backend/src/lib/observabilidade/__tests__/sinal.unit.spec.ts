import { comRodada } from "../rodada"
import { ligarSinais, semDadoPessoal, sinal, type Sinal } from "../sinal"

/**
 * O sinal e a rodada: o que fica guardado vai sem dado de cliente, e nenhum
 * dos dois derruba quem chamou — nem o e-mail, nem o job.
 */

describe("o sinal", () => {
  afterEach(() => ligarSinais(null))

  it("guarda o texto sem e-mail e sem CPF, e corta o comprido", () => {
    expect(semDadoPessoal("recusou rafael.souza@gmail.com (CPF 123.456.789-09)")).toBe(
      "recusou r•••@gmail.com (CPF •••)"
    )
    expect(semDadoPessoal("r•••@gmail.com")).toBe("r•••@gmail.com")
    expect(semDadoPessoal("x".repeat(600))).toHaveLength(500)
    expect(semDadoPessoal("")).toBeNull()
  })

  it("sem ninguém ligado não faz nada; ligado, manda limpo; falhando, não lança", async () => {
    expect(() => sinal({ integracao: "resend", ok: true })).not.toThrow()
    const recebidos: Sinal[] = []
    ligarSinais(async (s) => recebidos.push(s))
    sinal({ integracao: "resend", ok: false, resumo: "pra ana@x.com.br", detalhe: "422" })
    expect(recebidos).toEqual([
      { integracao: "resend", ok: false, resumo: "pra a•••@x.com.br", detalhe: "422" },
    ])
    ligarSinais(async () => {
      throw new Error("banco fora")
    })
    expect(() => sinal({ integracao: "frenet", ok: false })).not.toThrow()
    ligarSinais(() => {
      throw new Error("antes da promessa")
    })
    expect(() => sinal({ integracao: "frenet", ok: false })).not.toThrow()
    await new Promise((r) => setImmediate(r))
  })
})

describe("a rodada de uma rotina", () => {
  const container = (obs: object | null) => {
    const avisos: string[] = []
    return {
      avisos,
      resolve: (chave: string) => {
        if (chave === "logger") return { warn: (m: string) => avisos.push(m) }
        if (!obs) throw new Error("sem o módulo")
        return obs
      },
    }
  }

  it("anota o começo e o fim; o erro vai sem dado de cliente, e o job lança como antes", async () => {
    const chamadas: unknown[][] = []
    const obs = {
      comecarRodada: async (...a: unknown[]) => chamadas.push(["comecar", ...a]),
      terminarRodada: async (...a: unknown[]) => chamadas.push(["terminar", ...a]),
    }
    await comRodada("bumps", async () => undefined)(container(obs) as never)
    expect(chamadas.map((c) => c[0])).toEqual(["comecar", "terminar"])
    expect((chamadas[1][2] as { erro: unknown }).erro).toBeNull()

    chamadas.length = 0
    const falha = comRodada("bumps", async () => {
      throw new Error("o pedido de ana@x.com.br quebrou")
    })
    await expect(falha(container(obs) as never)).rejects.toThrow("quebrou")
    expect((chamadas[1][2] as { erro: unknown }).erro).toBe("o pedido de a•••@x.com.br quebrou")
  })

  it("sem a tabela, a rotina roda do mesmo jeito, e o log diz que a anotação não foi", async () => {
    let rodou = false
    const c = container({
      comecarRodada: async () => {
        throw new Error("relation obs_rotina does not exist")
      },
      terminarRodada: async () => undefined,
    })
    await comRodada("bumps", async () => {
      rodou = true
    })(c as never)
    expect(rodou).toBe(true)
    expect(c.avisos[0]).toMatch(/^\[rotina\] bumps: não consegui anotar a rodada/)

    let semModulo = false
    await comRodada("bumps", async () => {
      semModulo = true
    })(container(null) as never)
    expect(semModulo).toBe(true)
  })
})
