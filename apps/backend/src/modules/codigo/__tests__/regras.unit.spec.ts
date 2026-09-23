import {
  conferir,
  ENVIOS_POR_DIA,
  ENVIOS_POR_HORA,
  gerarCodigo,
  hashDoCodigo,
  MINUTOS_DE_VALIDADE,
  normalizarEmail,
  novoPendente,
  podeEnviar,
  registrarEnvio,
  SEGUNDOS_ENTRE_ENVIOS,
  TENTATIVAS,
} from "../regras"

/**
 * As fronteiras do código de acesso — cada número de `regras.ts` testado no
 * segundo antes e no segundo depois. O conferidor da conta prova o caminho
 * pela tela; o que ele não consegue é esperar 10 minutos ou um dia inteiro.
 */

const EMAIL = "rafael@email.com"
const AGORA = Date.parse("2026-09-21T12:00:00.000Z")
const MIN = 60 * 1000

describe("normalizarEmail", () => {
  it("minúscula e sem espaço — o Medusa grava assim", () => {
    expect(normalizarEmail("  Rafael@Email.COM ")).toBe("rafael@email.com")
  })
  it("recusa o que não é e-mail, e o que não é texto", () => {
    expect(normalizarEmail("rafael@")).toBeNull()
    expect(normalizarEmail("rafael@email")).toBeNull()
    expect(normalizarEmail(42)).toBeNull()
    expect(normalizarEmail(`${"a".repeat(250)}@x.com`)).toBeNull()
  })
})

describe("gerarCodigo", () => {
  it("sempre seis dígitos, com zero à esquerda", () => {
    for (let i = 0; i < 500; i++) expect(gerarCodigo()).toMatch(/^\d{6}$/)
  })
})

describe("hashDoCodigo", () => {
  it("o mesmo código em e-mails diferentes não dá o mesmo hash", () => {
    expect(hashDoCodigo(EMAIL, "123456")).not.toBe(hashDoCodigo("outro@email.com", "123456"))
  })
  it("depende do segredo do servidor", () => {
    const antes = process.env.JWT_SECRET
    try {
      process.env.JWT_SECRET = "um"
      const um = hashDoCodigo(EMAIL, "123456")
      process.env.JWT_SECRET = "dois"
      const dois = hashDoCodigo(EMAIL, "123456")
      expect(um).not.toBe(dois)
    } finally {
      // `process.env` guarda texto: devolver `undefined` gravaria "undefined" — outro segredo, e o
      // `conferir`, lá embaixo, passaria a recusar o código certo do `pendente`.
      if (antes === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = antes
    }
  })
})

describe("conferir", () => {
  const pendente = novoPendente(EMAIL, "482913", AGORA)

  it("certo é certo", () => {
    expect(conferir(pendente, EMAIL, "482913", AGORA)).toBe("certo")
  })
  it("errado é errado — inclusive o código certo de outro e-mail", () => {
    expect(conferir(pendente, EMAIL, "482914", AGORA)).toBe("errado")
    expect(conferir(pendente, "outro@email.com", "482913", AGORA)).toBe("errado")
  })
  it(`vale ${MINUTOS_DE_VALIDADE} minutos: um milissegundo antes sim, na hora não`, () => {
    const fim = AGORA + MINUTOS_DE_VALIDADE * MIN
    expect(conferir(pendente, EMAIL, "482913", fim - 1)).toBe("certo")
    expect(conferir(pendente, EMAIL, "482913", fim)).toBe("vencido")
  })
  it(`depois de ${TENTATIVAS} erros, nem o certo entra`, () => {
    expect(conferir({ ...pendente, tentativas: TENTATIVAS - 1 }, EMAIL, "482913", AGORA)).toBe(
      "certo"
    )
    expect(conferir({ ...pendente, tentativas: TENTATIVAS }, EMAIL, "482913", AGORA)).toBe(
      "esgotado"
    )
  })
  it("esgotado vem antes de vencido: o motivo que a tela mostra é o que resolve", () => {
    const fim = AGORA + MINUTOS_DE_VALIDADE * MIN
    expect(conferir({ ...pendente, tentativas: TENTATIVAS }, EMAIL, "482913", fim + MIN)).toBe(
      "esgotado"
    )
  })
  it("sem código pendente, ou com data quebrada", () => {
    expect(conferir(null, EMAIL, "482913", AGORA)).toBe("sem_codigo")
    expect(conferir({ ...pendente, expira_em: "ontem" }, EMAIL, "482913", AGORA)).toBe("vencido")
  })
})

describe("podeEnviar", () => {
  const ha = (ms: number) => new Date(AGORA - ms).toISOString()
  // Um código mandado há 10 segundos, ainda sem uso.
  const vivo = novoPendente(EMAIL, "482913", AGORA - 10 * 1000)

  it("o primeiro sempre pode", () => {
    expect(podeEnviar(undefined, AGORA)).toEqual({ ok: true })
  })
  it(`${SEGUNDOS_ENTRE_ENVIOS} segundos entre um e outro com código vivo, e diz quantos faltam`, () => {
    expect(podeEnviar({ codigo: vivo, envios: [ha(10 * 1000)] }, AGORA)).toEqual({
      ok: false,
      motivo: "espera",
      segundos: 20,
    })
    expect(podeEnviar({ codigo: vivo, envios: [ha(SEGUNDOS_ENTRE_ENVIOS * 1000)] }, AGORA)).toEqual(
      { ok: true }
    )
  })
  it("sem código vivo (usado, esgotado), não há o que esperar", () => {
    expect(podeEnviar({ codigo: null, envios: [ha(10 * 1000)] }, AGORA)).toEqual({ ok: true })
    expect(
      podeEnviar({ codigo: { ...vivo, tentativas: TENTATIVAS }, envios: [ha(10 * 1000)] }, AGORA)
    ).toEqual({ ok: true })
  })
  it(`${ENVIOS_POR_HORA} por hora — com código vivo ou não`, () => {
    const hora = Array.from({ length: ENVIOS_POR_HORA }, (_, i) => ha((i + 1) * 5 * MIN))
    expect(podeEnviar({ envios: hora }, AGORA)).toEqual({ ok: false, motivo: "limite" })
    expect(podeEnviar({ codigo: null, envios: hora }, AGORA)).toEqual({
      ok: false,
      motivo: "limite",
    })
    expect(podeEnviar({ envios: hora.slice(1) }, AGORA)).toEqual({ ok: true })
  })
  it(`${ENVIOS_POR_DIA} por dia, e o de 24 horas atrás já não conta`, () => {
    const dia = Array.from({ length: ENVIOS_POR_DIA }, (_, i) => ha((i + 2) * 60 * MIN))
    expect(podeEnviar({ envios: dia }, AGORA)).toEqual({ ok: false, motivo: "limite" })
    const velho = [...dia.slice(1), ha(24 * 60 * MIN)]
    expect(podeEnviar({ envios: velho }, AGORA)).toEqual({ ok: true })
  })
})

describe("registrarEnvio", () => {
  it("guarda o novo e esquece o que passou de 24 horas", () => {
    const lista = registrarEnvio(
      [new Date(AGORA - 25 * 60 * MIN).toISOString(), new Date(AGORA - MIN).toISOString()],
      AGORA
    )
    expect(lista).toEqual([new Date(AGORA - MIN).toISOString(), new Date(AGORA).toISOString()])
  })
})
