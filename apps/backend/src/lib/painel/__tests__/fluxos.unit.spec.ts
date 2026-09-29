import { lerConfigDosFluxos, type ConfigDosFluxos } from "../../crm/fluxos"
import { montarTelaDosFluxos, mudarConfigDosFluxos, type RegistroDaTela } from "../fluxos"

/**
 * A aba Fluxos: os números de cada fluxo (quem recebeu e comprou em 7 dias,
 * o controle, os cupons), e o ligar, o desligar e o desconto.
 */

const AGORA = new Date("2026-09-27T20:00:00Z")
const DIA = 24 * 60 * 60 * 1000
const antes = (dias: number) => new Date(AGORA.getTime() - dias * DIA)
const config: ConfigDosFluxos = {
  desconto: 10,
  fluxos: {
    pix: { ligado: true, desde: antes(20) },
    checkout: { ligado: false, desde: antes(20) },
    carrinho: { ligado: true, desde: antes(20) },
    navegacao: { ligado: false, desde: null },
    reposicao: { ligado: false, desde: null },
    jornada: { ligado: false, desde: null },
    "boas-vindas": { ligado: true, desde: antes(20) },
    estreia: { ligado: false, desde: null },
    resgate: { ligado: false, desde: null },
  },
}
const reg = (extra: Partial<RegistroDaTela>): RegistroDaTela => ({
  email: "ana@exemplo.com",
  fluxo: "checkout",
  toque: "checkout-30min",
  como: "enviado",
  em: antes(10),
  cupom: null,
  ...extra,
})

describe("a tela dos fluxos", () => {
  it("o indique um brother (0215): os links, os brothers que pagaram, o que compraram e os cupons", () => {
    const premio = (pedido: string, cupom: string | null, como = "enviado") =>
      reg({
        email: "rafa@exemplo.com",
        fluxo: "indicacao",
        chave: `premio|${pedido}`,
        toque: "indicacao-premio",
        como,
        em: antes(3),
        cupom,
      })
    const tela = montarTelaDosFluxos({
      config,
      registros: [
        premio("order_1", "VALEU-AAAAAA"),
        premio("order_2", "VALEU-BBBBBB"),
        // O teto do ano: o brother comprou, sem cupom pra quem indicou.
        premio("order_3", null, "pulado"),
      ],
      pedidos: [
        {
          id: "order_1",
          email: "b1@x.com",
          created_at: antes(3),
          total: 79.9,
          status: "completed",
        },
        { id: "order_2", email: "b2@x.com", created_at: antes(3), total: 120, status: "completed" },
        { id: "order_3", email: "b3@x.com", created_at: antes(3), total: 50, status: "canceled" },
        { id: "order_9", email: "x@x.com", created_at: antes(3), total: 999, status: "completed" },
      ],
      cuponsUsados: new Set(["VALEU-AAAAAA"]),
      links: 12,
    })
    expect(tela.indicacao).toEqual({
      links: 12,
      amigos: 3,
      vendido: 199.9,
      cupons: 2,
      cuponsUsados: 1,
    })
    // Nenhum fluxo conta o prêmio: ele é do indique.
    expect(tela.fluxos.every((f) => f.numeros.enviados === 0)).toBe(true)
  })

  it("conta quem recebeu, quem comprou em 7 dias e quanto, e o controle", () => {
    const tela = montarTelaDosFluxos({
      config,
      registros: [
        reg({}),
        reg({ toque: "checkout-4h", em: antes(9.9) }),
        reg({ toque: "checkout-24h", em: antes(9), cupom: "VOLTA-AAAAAA" }),
        reg({ email: "bia@exemplo.com", em: antes(10) }),
        reg({ email: "caio@exemplo.com", como: "controle", em: antes(10) }),
        reg({ email: "dani@exemplo.com", como: "controle", em: antes(10) }),
        reg({ email: "eva@exemplo.com", fluxo: "pix", toque: "pix-vence", em: antes(3) }),
      ],
      pedidos: [
        // Ana comprou 2 dias depois: conta, com o primeiro pedido.
        { email: "Ana@Exemplo.com", created_at: antes(8), total: 159.8, status: "completed" },
        { email: "ana@exemplo.com", created_at: antes(7), total: 50, status: "completed" },
        // Bia comprou 9 dias depois: não conta.
        { email: "bia@exemplo.com", created_at: antes(1), total: 79.9, status: "completed" },
        // Caio, do controle, comprou; Dani cancelou.
        { email: "caio@exemplo.com", created_at: antes(9), total: 79.9, status: "completed" },
        { email: "dani@exemplo.com", created_at: antes(9), total: 79.9, status: "canceled" },
      ],
      cuponsUsados: new Set(["VOLTA-AAAAAA"]),
    })
    expect(tela.fluxos.map((f) => f.id)).toEqual([
      "pix",
      "checkout",
      "carrinho",
      "navegacao",
      "reposicao",
      "jornada",
      "boas-vindas",
      "estreia",
      "resgate",
    ])
    const checkout = tela.fluxos.find((f) => f.id === "checkout")!
    expect(checkout.ligado).toBe(false)
    expect(checkout.numeros).toEqual({
      pessoas: 2,
      enviados: 4,
      cupons: 1,
      cuponsUsados: 1,
      compraram: 1,
      vendido: 159.8,
      controle: { pessoas: 2, compraram: 1 },
    })
    expect(checkout.toques.map((t) => [t.id, t.enviados, t.cupom])).toEqual([
      ["checkout-30min", 2, false],
      ["checkout-4h", 1, false],
      ["checkout-24h", 1, true],
      ["checkout-48h", 0, false],
    ])
    const pix = tela.fluxos.find((f) => f.id === "pix")!
    expect(pix.ligado).toBe(true)
    expect(pix.numeros.enviados).toBe(1)
    expect(pix.toques[0].quando).toBe("15 min antes de vencer")
    expect(tela.desconto).toBe(10)
  })
})

describe("mudar os fluxos", () => {
  it("desligar guarda o desde; ligar de novo começa agora", () => {
    const desligado = mudarConfigDosFluxos(config, { fluxo: "pix", ligado: false }, AGORA)
    expect(desligado).toEqual({
      ok: true,
      config: { ...config, fluxos: { ...config.fluxos, pix: { ligado: false, desde: antes(20) } } },
    })
    const religado = mudarConfigDosFluxos(config, { fluxo: "checkout", ligado: true }, AGORA)
    expect(religado.ok && religado.config.fluxos.checkout).toEqual({ ligado: true, desde: AGORA })
    // Ligado que já estava ligado não perde o desde.
    const igual = mudarConfigDosFluxos(config, { fluxo: "pix", ligado: true }, AGORA)
    expect(igual.ok && igual.config.fluxos.pix.desde).toEqual(antes(20))
  })

  it("o desconto: inteiro, de 5% a 30%", () => {
    expect(mudarConfigDosFluxos(config, { desconto: 15 }, AGORA)).toMatchObject({
      ok: true,
      config: { desconto: 15 },
    })
    for (const d of [4, 31, 12.5, "abc"])
      expect(mudarConfigDosFluxos(config, { desconto: d }, AGORA).ok).toBe(false)
  })

  it("o torto não passa", () => {
    expect(mudarConfigDosFluxos(config, { fluxo: "sms", ligado: true }, AGORA).ok).toBe(false)
    expect(mudarConfigDosFluxos(config, { fluxo: "pix", ligado: "sim" }, AGORA).ok).toBe(false)
    expect(mudarConfigDosFluxos(config, {}, AGORA).ok).toBe(false)
    expect(lerConfigDosFluxos({}).desconto).toBe(10)
  })
})
