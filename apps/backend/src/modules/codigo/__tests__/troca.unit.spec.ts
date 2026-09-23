import { createHmac } from "node:crypto"
import {
  conferir,
  contextoDaTroca,
  ENVIOS_POR_DIA,
  ENVIOS_POR_HORA,
  hashDoCodigo,
  novoPendente,
  podeEnviarTroca,
  SEGUNDOS_ENTRE_ENVIOS,
  type MetadadosDoCodigo,
} from "../regras"

/**
 * A troca de e-mail da conta — a seção do fim de `regras.ts`. O resto das
 * regras (validade, tentativas) é o mesmo do código de entrar, e está
 * testado em `regras.unit.spec.ts`; aqui fica o que é só da troca: o código
 * dela não servir pra mais nada, e os limites contados por conta.
 */

const NOVO = "rafael.novo@email.com"
const CONTA = contextoDaTroca("authid_01CONTA")
const AGORA = Date.parse("2026-09-23T12:00:00.000Z")
const SEG = 1000
const MIN = 60 * SEG

describe("o código da troca", () => {
  it("confere na conta que pediu", () => {
    const pendente = novoPendente(NOVO, "482917", AGORA, CONTA)
    expect(conferir(pendente, NOVO, "482917", AGORA, CONTA)).toBe("certo")
    expect(conferir(pendente, NOVO, "482918", AGORA, CONTA)).toBe("errado")
  })

  it("não serve pra entrar — nem o de entrar serve pra trocar", () => {
    const daTroca = novoPendente(NOVO, "482917", AGORA, CONTA)
    expect(conferir(daTroca, NOVO, "482917", AGORA)).toBe("errado")
    const deEntrar = novoPendente(NOVO, "482917", AGORA)
    expect(conferir(deEntrar, NOVO, "482917", AGORA, CONTA)).toBe("errado")
  })

  it("não serve pra trocar o e-mail de outra conta", () => {
    const pendente = novoPendente(NOVO, "482917", AGORA, CONTA)
    const outra = contextoDaTroca("authid_01OUTRA")
    expect(conferir(pendente, NOVO, "482917", AGORA, outra)).toBe("errado")
  })

  it("o hash de entrar não mudou: código pedido antes do deploy continua valendo", () => {
    const esperado = createHmac("sha256", process.env.JWT_SECRET || "supersecret")
      .update(`codigo-de-acesso:${NOVO}:482917`)
      .digest("hex")
    expect(hashDoCodigo(NOVO, "482917")).toBe(esperado)
  })
})

describe("podeEnviarTroca", () => {
  const envios = (...atras: number[]) => atras.map((ms) => new Date(AGORA - ms).toISOString())
  const vivo = (email: string, enviadoHa: number): MetadadosDoCodigo => ({
    troca: { email, codigo: novoPendente(email, "111111", AGORA - enviadoHa, CONTA) },
    envios_troca: envios(enviadoHa),
  })

  it("a primeira sempre pode", () => {
    expect(podeEnviarTroca(undefined, NOVO, AGORA)).toEqual({ ok: true })
    expect(podeEnviarTroca({}, NOVO, AGORA)).toEqual({ ok: true })
  })

  it(`o MESMO e-mail com código vivo espera ${SEGUNDOS_ENTRE_ENVIOS} segundos`, () => {
    expect(podeEnviarTroca(vivo(NOVO, 10 * SEG), NOVO, AGORA)).toEqual({
      ok: false,
      motivo: "espera",
      segundos: SEGUNDOS_ENTRE_ENVIOS - 10,
    })
    expect(podeEnviarTroca(vivo(NOVO, SEGUNDOS_ENTRE_ENVIOS * SEG), NOVO, AGORA)).toEqual({
      ok: true,
    })
  })

  it("outro e-mail não espera: é a pessoa corrigindo o que digitou", () => {
    expect(podeEnviarTroca(vivo("rafael.novvo@email.com", 5 * SEG), NOVO, AGORA)).toEqual({
      ok: true,
    })
  })

  it(`${ENVIOS_POR_HORA} por hora, pra qualquer e-mail`, () => {
    const cinco = envios(...Array.from({ length: ENVIOS_POR_HORA }, (_, i) => (i + 1) * MIN))
    expect(podeEnviarTroca({ envios_troca: cinco }, NOVO, AGORA)).toEqual({
      ok: false,
      motivo: "limite",
    })
  })

  it(`${ENVIOS_POR_DIA} por dia, mesmo espalhados`, () => {
    // Um a cada duas horas: nunca dois na mesma hora, e dez em vinte horas.
    const dez = envios(...Array.from({ length: ENVIOS_POR_DIA }, (_, i) => (i * 2 + 1) * 60 * MIN))
    expect(podeEnviarTroca({ envios_troca: dez }, NOVO, AGORA)).toEqual({
      ok: false,
      motivo: "limite",
    })
    // O de 25 horas atrás já não conta: sobram nove.
    const velho = new Date(AGORA - 25 * 60 * MIN).toISOString()
    expect(podeEnviarTroca({ envios_troca: [velho, ...dez.slice(1)] }, NOVO, AGORA)).toEqual({
      ok: true,
    })
  })

  it("os códigos de ENTRAR não gastam o limite da troca", () => {
    const cheio = envios(...Array.from({ length: ENVIOS_POR_DIA }, (_, i) => (i + 1) * MIN))
    expect(podeEnviarTroca({ envios: cheio }, NOVO, AGORA)).toEqual({ ok: true })
  })
})
