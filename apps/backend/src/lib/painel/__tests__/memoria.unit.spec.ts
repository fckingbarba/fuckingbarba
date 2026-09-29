import { esquecerAMemoria, lembrar, segundosDaMemoria } from "../memoria"

/**
 * A memória curta das leituras do Marketing (0199): a mesma leitura sai uma
 * vez pra quem chega junto e pra quem chega nos 90 segundos seguintes; a que
 * falhou não fica; com `MARKETING_MEMORIA_SEGUNDOS=0`, cada pergunta lê.
 */

const antes = process.env.MARKETING_MEMORIA_SEGUNDOS
beforeEach(() => {
  delete process.env.MARKETING_MEMORIA_SEGUNDOS
  esquecerAMemoria()
})
afterAll(() => {
  if (antes === undefined) delete process.env.MARKETING_MEMORIA_SEGUNDOS
  else process.env.MARKETING_MEMORIA_SEGUNDOS = antes
  esquecerAMemoria()
})

function contador<T>(valor: T) {
  const c = { leituras: 0, ler: async () => (c.leituras++, valor) }
  return c
}

describe("a memória curta do Marketing", () => {
  it("quem chega junto espera a mesma leitura", async () => {
    const c = contador([{ id: "order_1" }])
    const [a, b, d] = await Promise.all([
      lembrar("pedidos:x", c.ler, 0),
      lembrar("pedidos:x", c.ler, 0),
      lembrar("pedidos:x", c.ler, 0),
    ])
    expect(c.leituras).toBe(1)
    expect(a).toBe(b)
    expect(b).toBe(d)
  })

  it("guarda 90 segundos; depois, lê de novo", async () => {
    const c = contador(1)
    await lembrar("pedidos:x", c.ler, 0)
    await lembrar("pedidos:x", c.ler, 89_999)
    expect(c.leituras).toBe(1)
    await lembrar("pedidos:x", c.ler, 90_000)
    expect(c.leituras).toBe(2)
  })

  it("cada chave é uma leitura: outro período, outra conta", async () => {
    const c = contador(1)
    await lembrar("pedidos:2026-09-01", c.ler, 0)
    await lembrar("pedidos:2026-08-29", c.ler, 0)
    await lembrar("pagamentos:tudo", c.ler, 0)
    expect(c.leituras).toBe(3)
  })

  it("a leitura que falhou não fica guardada: a próxima pergunta lê de novo", async () => {
    let leituras = 0
    const ler = async () => {
      leituras++
      if (leituras === 1) throw new Error("o banco caiu")
      return "ok"
    }
    await expect(lembrar("pedidos:x", ler, 0)).rejects.toThrow("o banco caiu")
    await expect(lembrar("pedidos:x", ler, 1)).resolves.toBe("ok")
    expect(leituras).toBe(2)
  })

  it("MARKETING_MEMORIA_SEGUNDOS=0 desliga: cada pergunta lê", async () => {
    process.env.MARKETING_MEMORIA_SEGUNDOS = "0"
    const c = contador(1)
    await Promise.all([lembrar("pedidos:x", c.ler, 0), lembrar("pedidos:x", c.ler, 0)])
    expect(c.leituras).toBe(2)
  })

  it("sem a variável, ou com ela torta, são 90 segundos", () => {
    expect(segundosDaMemoria()).toBe(90)
    process.env.MARKETING_MEMORIA_SEGUNDOS = "abc"
    expect(segundosDaMemoria()).toBe(90)
    process.env.MARKETING_MEMORIA_SEGUNDOS = "-5"
    expect(segundosDaMemoria()).toBe(90)
    process.env.MARKETING_MEMORIA_SEGUNDOS = "30"
    expect(segundosDaMemoria()).toBe(30)
  })
})
