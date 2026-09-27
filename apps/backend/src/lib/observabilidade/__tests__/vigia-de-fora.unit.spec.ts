import { integracoesNaTela, type EstadoDasIntegracoes } from "../../painel/observabilidade"
import { ligarSinais, type Sinal } from "../sinal"
import { avisarOVigiaDeFora, enderecoDoVigiaDeFora } from "../vigia-de-fora"

/**
 * O vigia de fora: o "estou viva" que o job `vigiar-a-loja` manda pro
 * UptimeRobot, o sinal do dia (sem o endereço, que é segredo) e a linha nas
 * integrações da Observabilidade.
 */

const URL_DO_VIGIA = "https://heartbeat.uptimerobot.com/m123456-segredo"

let sinais: Sinal[] = []
beforeEach(() => {
  sinais = []
  ligarSinais(async (s) => {
    sinais.push(s)
  })
})
afterAll(() => ligarSinais(null))

const resposta = (status: number) =>
  (async () => new Response("ok", { status })) as unknown as typeof fetch

describe("o endereço", () => {
  it("só endereço de verdade vale; sem ele, nada", () => {
    expect(enderecoDoVigiaDeFora(` ${URL_DO_VIGIA} `)).toBe(URL_DO_VIGIA)
    expect(enderecoDoVigiaDeFora("")).toBeNull()
    expect(enderecoDoVigiaDeFora(undefined)).toBeNull()
    expect(enderecoDoVigiaDeFora("heartbeat.uptimerobot.com/x")).toBeNull()
    expect(enderecoDoVigiaDeFora("https://x.com/tem espaço")).toBeNull()
  })
})

describe('o "estou viva"', () => {
  it("chegou: o sinal do dia diz que sim", async () => {
    let chamado = ""
    const buscar = (async (url: string) => {
      chamado = url
      return new Response("ok", { status: 200 })
    }) as unknown as typeof fetch
    expect(await avisarOVigiaDeFora(URL_DO_VIGIA, buscar)).toBe("ok")
    expect(chamado).toBe(URL_DO_VIGIA)
    await new Promise((r) => setImmediate(r))
    expect(sinais).toEqual([{ integracao: "vigia-de-fora", ok: true, resumo: null, detalhe: null }])
  })

  it("não chegou: a falha fica no dia, sem o endereço (que é segredo)", async () => {
    expect(await avisarOVigiaDeFora(URL_DO_VIGIA, resposta(503))).toBe("falhou")
    const lancou = (async () => {
      throw Object.assign(new Error("demorou"), { name: "TimeoutError" })
    }) as unknown as typeof fetch
    expect(await avisarOVigiaDeFora(URL_DO_VIGIA, lancou)).toBe("falhou")
    await new Promise((r) => setImmediate(r))
    expect(sinais.map((s) => [s.ok, s.resumo])).toEqual([
      [false, "o vigia de fora respondeu 503"],
      [false, "o vigia de fora não respondeu em 10 segundos"],
    ])
    expect(JSON.stringify(sinais)).not.toContain("segredo")
  })

  it("sem endereço, nem tenta — e nada vira sinal", async () => {
    let tentou = false
    const buscar = (async () => {
      tentou = true
      return new Response("ok")
    }) as unknown as typeof fetch
    expect(await avisarOVigiaDeFora(null, buscar)).toBe("sem-endereco")
    expect(tentou).toBe(false)
    expect(sinais).toEqual([])
  })
})

describe("nas integrações da Observabilidade", () => {
  const AGORA = new Date("2026-09-26T23:40:00Z")
  const min = (n: number) => new Date(AGORA.getTime() - n * 60_000)
  const estado = (extra: Partial<EstadoDasIntegracoes> = {}): EstadoDasIntegracoes => ({
    agora: AGORA,
    producao: true,
    loja: { configurada: true, ok: true, ms: 180, motivo: null, noAr: null },
    medusaDesde: min(600),
    pagarme: true,
    frenet: true,
    resend: true,
    ga4: true,
    erp: { nome: "Bling", configurado: true, conectado: true, queda: null, ultimaNota: null },
    sinais: [],
    ...extra,
  })
  const vigia = (e: EstadoDasIntegracoes) =>
    integracoesNaTela(e).find((i) => i.id === "vigia-de-fora")!

  it("sem a variável: desligado, dizendo o que falta", () => {
    expect(vigia(estado())).toMatchObject({
      nome: "Vigia de fora",
      onde: "UptimeRobot",
      s: "off",
      texto:
        "Não configurado: se o servidor cair, ninguém avisa no celular (VIGIA_DE_FORA_URL, no Railway).",
    })
  })

  it('ligado: quando foi o último "estou viva", e os que não chegaram', () => {
    const certo = vigia(
      estado({
        vigiaDeFora: true,
        sinais: [
          {
            integracao: "vigia-de-fora",
            dia: "2026-09-26",
            ok: 40,
            falhas: 0,
            ultimo_ok_em: min(3),
          },
        ],
      })
    )
    expect(certo.s).toBe("ok")
    expect(certo.texto).toMatch(/^Último "estou viva" hoje, \d\d:\d\d$/)

    const falhou = vigia(
      estado({
        vigiaDeFora: true,
        sinais: [
          {
            integracao: "vigia-de-fora",
            dia: "2026-09-26",
            ok: 40,
            falhas: 3,
            ultimo_ok_em: min(20),
            ultima_falha_em: min(4),
          },
        ],
      })
    )
    expect(falhou.s).toBe("erro")
    expect(falhou.texto).toMatch(/ · 3 não chegaram$/)

    expect(vigia(estado({ vigiaDeFora: true })).texto).toBe('Nenhum "estou viva" hoje ainda')
  })
})
