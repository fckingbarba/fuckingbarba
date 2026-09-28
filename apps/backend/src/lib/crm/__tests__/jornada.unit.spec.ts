import type { PedidoDaPessoa } from "../etiquetas"
import { FLUXOS, lerConfigDosFluxos, registrosDoMotor, TOQUE_DO_CHECKIN } from "../fluxos"
import {
  chegadaDo,
  jornadasDaPessoa,
  naJanelaDaJornada,
  SKU_DA_ROTINA as SKU,
  sugestoesDaRotina,
} from "../jornada"

/**
 * A jornada do resultado (0187): o dia em que o pedido chegou, o que
 * completa a rotina, e a jornada no motor — com a resposta do check-in fora
 * do teto, como a escolha do "Barba ou cabelo?".
 */

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date("2026-09-28T15:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)
const EMAIL = "rafael@exemplo.com"

const pedido = (
  id: string,
  pago: number,
  itens: [string, string | null, number?][],
  extra: Partial<PedidoDaPessoa> = {}
): PedidoDaPessoa => ({
  id,
  numero: "3312",
  pagoEm: haDias(pago),
  entregueEm: null,
  cancelado: false,
  itens: itens.map(([sku, handle, quantidade = 1]) => ({ handle, sku, nome: sku, quantidade })),
  cupons: [],
  ...extra,
})

describe("o que completa a rotina", () => {
  it("o Fator pede o óleo; com o óleo, o shampoo; 1 Fator só, os 3 Fatores", () => {
    expect(sugestoesDaRotina(new Set(["fator"]), 1)).toEqual([SKU.oleo, SKU.tresFatores])
    expect(sugestoesDaRotina(new Set(["fator", "oleo"]), 3)).toEqual([SKU.shampoo, SKU.kitCompleto])
    expect(sugestoesDaRotina(new Set(["fator", "oleo", "shampoo", "balm"]), 3)).toEqual([])
  })

  it("quem cuida da barba sem ter os três: o Kit Completo; no máximo dois", () => {
    expect(sugestoesDaRotina(new Set(["oleo"]), 0)).toEqual([SKU.kitCompleto])
    expect(sugestoesDaRotina(new Set(["oleo", "shampoo", "balm"]), 0)).toEqual([])
    expect(sugestoesDaRotina(new Set(["fator", "balm"]), 1)).toHaveLength(2)
    expect(sugestoesDaRotina(new Set(["pasta"]), 0)).toEqual([])
  })
})

describe("a jornada de cada pedido", () => {
  it("chega no aviso da Frenet, ou 10 dias depois de pago; cancelado e não pago, não", () => {
    expect(chegadaDo(pedido("order_a", 20, []))).toEqual(haDias(10))
    expect(chegadaDo(pedido("order_b", 20, [], { entregueEm: haDias(15) }))).toEqual(haDias(15))
    expect(chegadaDo(pedido("order_c", 20, [], { cancelado: true }))).toBeNull()
    expect(chegadaDo(pedido("order_d", 20, [], { pagoEm: null }))).toBeNull()
  })

  it("o Fator do pedido, os produtos, e a rotina pelo que a pessoa tem em todas as compras", () => {
    const [j] = jornadasDaPessoa(
      EMAIL,
      [pedido("order_novo", 5, [["FBFCB01", "fator-de-crescimento-para-barba"]])],
      // Na Nuvemshop ela levou o óleo: a sugestão pula pro shampoo.
      [pedido("nuvemshop:1", 90, [["FBOL01", null]])]
    )
    expect(j).toMatchObject({
      email: EMAIL,
      pedido: "order_novo",
      numero: 3312,
      handles: ["fator-de-crescimento-para-barba"],
      temFator: true,
      sugestoes: [SKU.shampoo, SKU.kitCompleto],
    })
  })

  it("a janela: dos que ainda vão chegar até 61 dias depois da chegada", () => {
    const [j] = jornadasDaPessoa(EMAIL, [pedido("order_1", 5, [["FBOL01", "oleo-para-barba"]])], [])
    // Pago há 5 dias, sem aviso: chega daqui a 5.
    expect(naJanelaDaJornada(j, AGORA)).toBe(true)
    expect(naJanelaDaJornada(j, new Date(AGORA.getTime() + 66 * DIA))).toBe(true)
    expect(naJanelaDaJornada(j, new Date(AGORA.getTime() + 67 * DIA))).toBe(false)
  })
})

describe("a jornada no motor", () => {
  it("começa desligada; os toques na chegada, em 3, 7, 21 e 60 dias; depois da reposição", () => {
    expect(lerConfigDosFluxos({}).fluxos.jornada).toEqual({ ligado: false, desde: null })
    expect(FLUXOS.jornada.toques.map((t) => t.depois / DIA)).toEqual([0, 3, 7, 21, 60])
    expect(FLUXOS.jornada.toques.some((t) => t.cupom)).toBe(false)
    expect(FLUXOS.reposicao.prioridade).toBeLessThan(FLUXOS.jornada.prioridade)
    expect(FLUXOS.jornada.prioridade).toBeLessThan(FLUXOS["boas-vindas"].prioridade)
  })

  it("a resposta do check-in não é e-mail: fica fora do teto", () => {
    const registros = registrosDoMotor([
      {
        email: EMAIL,
        fluxo: "jornada",
        chave: "order_1",
        toque: TOQUE_DO_CHECKIN,
        como: "bem",
        em: AGORA,
      },
      {
        email: EMAIL,
        fluxo: "jornada",
        chave: "order_1",
        toque: "jornada-7d",
        como: "enviado",
        em: AGORA,
      },
    ])
    expect(registros.map((r) => r.toque)).toEqual(["jornada-7d"])
  })
})
