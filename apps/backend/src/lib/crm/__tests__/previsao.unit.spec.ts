import type { Etiquetas } from "../etiquetas"
import {
  CICLO_SEM_SABER_DIAS,
  CONTINUA,
  datasDasCompras,
  previsaoDaPessoa,
  type PedidoDaPrevisao,
} from "../previsao"

/**
 * A previsão por cliente (0220): a próxima compra pelo ritmo (3 compras ou
 * mais) ou pelo produto, a chance de sair pelo atraso e pelo engajamento, e o
 * LTV — o que já gastou e o previsto em 12 meses.
 */

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date("2026-09-29T15:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)
const pedido = (pago: number, total: number, extra: Partial<PedidoDaPrevisao> = {}) =>
  ({
    id: `p${pago}`,
    numero: null,
    pagoEm: haDias(pago),
    entregueEm: null,
    cancelado: false,
    itens: [],
    cupons: [],
    total,
    ...extra,
  }) as PedidoDaPrevisao
const etiquetas = (
  extra: Partial<{
    proximaCompra: Date | null
    etapa: Etiquetas["etapa"]["valor"]
    engajamento: Etiquetas["engajamento"]["valor"]
  }> = {}
): Pick<Etiquetas, "proximaCompra" | "etapa" | "engajamento"> => ({
  proximaCompra: {
    em: extra.proximaCompra === undefined ? null : extra.proximaCompra,
    porque: "acaba o Fator de Crescimento",
    estimada: false,
  },
  etapa: { valor: extra.etapa ?? "recorrente", porque: "" },
  engajamento: {
    valor: extra.engajamento ?? "morno",
    porque: extra.engajamento === "quente" ? "visitou a loja há 3 dias" : "comprou há 40 dias",
  },
})

describe("as compras", () => {
  it("as de menos de 7 dias uma da outra contam como uma", () => {
    expect(datasDasCompras([haDias(10), haDias(100), haDias(98), haDias(50)])).toEqual([
      haDias(100),
      haDias(50),
      haDias(10),
    ])
  })
})

describe("a próxima compra", () => {
  it("com 3 compras, pelo ritmo: a mediana dos intervalos, contada da última", () => {
    const p = previsaoDaPessoa({
      pedidos: [pedido(100, 150), pedido(60, 150), pedido(20, 150)],
      etiquetas: etiquetas({ proximaCompra: haDias(-40) }),
      agora: AGORA,
    })!
    expect(p.ritmo).toBe(40)
    expect(p.compras).toBe(3)
    expect(p.proximaCompra.em).toEqual(haDias(-20))
    expect(p.proximaCompra.porque).toBe("pelo ritmo: compra a cada 40 dias (3 compras)")
  })

  it("com menos, a da etiqueta: quando o produto acaba; quem não comprou, nada", () => {
    const acaba = haDias(-5)
    const p = previsaoDaPessoa({
      pedidos: [pedido(30, 80)],
      etiquetas: etiquetas({ proximaCompra: acaba }),
      agora: AGORA,
    })!
    expect(p.ritmo).toBeNull()
    expect(p.proximaCompra).toEqual({ em: acaba, porque: "acaba o Fator de Crescimento" })
    expect(previsaoDaPessoa({ pedidos: [], etiquetas: etiquetas(), agora: AGORA })).toBeNull()
    // O cancelado e o não pago não contam.
    expect(
      previsaoDaPessoa({
        pedidos: [pedido(30, 80, { cancelado: true }), pedido(10, 80, { pagoEm: null })],
        etiquetas: etiquetas(),
        agora: AGORA,
      })
    ).toBeNull()
  })
})

describe("a chance de sair", () => {
  const chance = (proxima: Date | null, extra: Parameters<typeof etiquetas>[0] = {}) =>
    previsaoDaPessoa({
      pedidos: [pedido(40, 100)],
      etiquetas: etiquetas({ proximaCompra: proxima, ...extra }),
      agora: AGORA,
    })!.chance

  it("baixa antes do dia; média até a tolerância; alta depois", () => {
    expect(chance(haDias(-3)).valor).toBe("baixa")
    expect(chance(haDias(10))).toMatchObject({ valor: "media" })
    expect(chance(haDias(10)).porque).toMatch(/^passou 10 dias do dia de comprar de novo/)
    expect(chance(haDias(20)).valor).toBe("media")
    expect(chance(haDias(21)).valor).toBe("alta")
  })

  it("quem visitou ou clicou há pouco desce um nível; o sunset é sempre alta", () => {
    expect(chance(haDias(30), { engajamento: "quente" })).toMatchObject({ valor: "media" })
    expect(chance(haDias(30), { engajamento: "quente" }).porque).toMatch(
      /visitou a loja há 3 dias$/
    )
    expect(chance(haDias(10), { engajamento: "quente" }).valor).toBe("baixa")
    expect(chance(haDias(-3), { etapa: "sunset" }).valor).toBe("alta")
  })

  it("sem o dia, pelos dias sem comprar: 60 e o dobro", () => {
    const sem = (dias: number) =>
      previsaoDaPessoa({ pedidos: [pedido(dias, 100)], etiquetas: etiquetas(), agora: AGORA })!
        .chance.valor
    expect([sem(30), sem(80), sem(130)]).toEqual(["baixa", "media", "alta"])
  })
})

describe("o LTV", () => {
  it("o que já gastou, o ticket por compra, e o previsto: ticket × compras no ano × continuar", () => {
    const p = previsaoDaPessoa({
      pedidos: [pedido(100, 100), pedido(60, 140), pedido(58, 20), pedido(20, 120)],
      etiquetas: etiquetas(),
      agora: AGORA,
    })!
    // As de 60 e 58 dias são uma compra só: 3 compras, R$ 380.
    expect(p.ltv.ate).toBe(380)
    expect(p.ltv.ticket).toBe(126.67)
    expect(p.ritmo).toBe(40)
    expect(p.chance.valor).toBe("baixa")
    expect(p.ltv.previsto).toBe(Math.round(126.67 * (365 / 40) * CONTINUA.baixa))
    expect(p.ltv.porque).toContain("a cada 40 dias")
  })

  it("sem ritmo: o tempo do produto; sem nenhum, uma compra a cada 4 meses", () => {
    const doProduto = previsaoDaPessoa({
      pedidos: [pedido(10, 90)],
      etiquetas: etiquetas({ proximaCompra: haDias(-35) }),
      agora: AGORA,
    })!
    expect(doProduto.ltv.previsto).toBe(Math.round(90 * (365 / 45) * CONTINUA.baixa))
    const semNada = previsaoDaPessoa({
      pedidos: [pedido(10, 90)],
      etiquetas: etiquetas(),
      agora: AGORA,
    })!
    expect(semNada.ltv.previsto).toBe(
      Math.round(90 * (365 / CICLO_SEM_SABER_DIAS) * CONTINUA.baixa)
    )
  })
})
