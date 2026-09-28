import { DIAS_PADRAO, type PedidoDaPessoa } from "../etiquetas"
import { decidir, FLUXOS, lerConfigDosFluxos } from "../fluxos"
import { naJanelaDaReposicao, reposicoesDaPessoa, type PedidoDaReposicao } from "../reposicao"

/**
 * A reposição (0185): pra cada tipo de produto, a última compra paga que o
 * trouxe diz o dia em que ele acaba — e os toques saem em volta desse dia.
 */

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date("2026-09-28T15:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)
const EMAIL = "rafael@exemplo.com"

const pedido = (
  ref: string,
  dias: number,
  itens: [string, number?][],
  extra: Partial<PedidoDaPessoa> = {}
): PedidoDaReposicao => ({
  id: ref,
  ref,
  numero: null,
  pagoEm: haDias(dias),
  entregueEm: null,
  cancelado: false,
  itens: itens.map(([sku, quantidade = 1]) => ({ handle: null, sku, nome: sku, quantidade })),
  cupons: [],
  ...extra,
})
const dia = (d: Date) => Math.round((d.getTime() - AGORA.getTime()) / DIA)

describe("quando cada tipo acaba", () => {
  it("a entrega estimada (7 dias depois de pago) mais os dias do tipo; o pacote conta as unidades", () => {
    // Um Fator pago há 20 dias: entregue no 7º, dura 30 — acaba daqui a 17.
    const [fator] = reposicoesDaPessoa(EMAIL, [pedido("order_1", 20, [["FBFCB01"]])], DIAS_PADRAO)
    expect(fator).toMatchObject({ componente: "fator", pedido: "order_1", skus: ["FBFCB01"] })
    expect(dia(fator.acaba)).toBe(17)
    // 3 Fatores: 90 dias.
    const [tres] = reposicoesDaPessoa(EMAIL, [pedido("order_2", 20, [["FBKIT06"]])], DIAS_PADRAO)
    expect(dia(tres.acaba)).toBe(77)
    // Com a entrega de verdade, conta dela.
    const [entregue] = reposicoesDaPessoa(
      EMAIL,
      [pedido("order_3", 20, [["FBFCB01"]], { entregueEm: haDias(15) })],
      DIAS_PADRAO
    )
    expect(dia(entregue.acaba)).toBe(15)
  })

  it("o kit dá um de cada tipo; cada tipo, pela última compra que o trouxe", () => {
    const r = reposicoesDaPessoa(
      EMAIL,
      [
        pedido("order_velho", 60, [["FBFCB01"], ["FBKIT01"]]),
        pedido("nso_novo", 10, [["FBFCB01"]]),
        // Cancelado e não pago não contam.
        pedido("order_cancelado", 5, [["FBOL01"]], { cancelado: true }),
        pedido("order_pix", 2, [["FBBM01"]], { pagoEm: null }),
      ],
      DIAS_PADRAO
    )
    const de = (c: string) => r.find((x) => x.componente === c)
    expect(r.map((x) => x.componente).sort()).toEqual(["balm", "fator", "oleo", "shampoo"])
    expect(de("fator")?.pedido).toBe("nso_novo")
    expect(de("oleo")).toMatchObject({ pedido: "order_velho", skus: ["FBKIT01"] })
    expect(dia(de("balm")!.acaba)).toBe(-60 + 7 + 60)
  })

  it("a janela: de 8 dias antes a 11 depois do dia de acabar", () => {
    const em = (dias: number) => ({
      email: EMAIL,
      componente: "fator" as const,
      pedido: "order_1",
      skus: [],
      acaba: new Date(AGORA.getTime() + dias * DIA),
    })
    expect([8, 9, -11, -12].map((d) => naJanelaDaReposicao(em(d), AGORA))).toEqual([
      true,
      false,
      true,
      false,
    ])
  })
})

describe("a reposição no motor", () => {
  it("começa desligada; os toques são 7 e 2 dias antes, 3 e 10 dias depois", () => {
    expect(lerConfigDosFluxos({}).fluxos.reposicao).toEqual({ ligado: false, desde: null })
    expect(FLUXOS.reposicao.toques.map((t) => t.depois / DIA)).toEqual([-7, -2, 3, 10])
    expect(FLUXOS.reposicao.toques.some((t) => t.cupom)).toBe(false)
    expect(FLUXOS.reposicao.prioridade).toBeLessThan(FLUXOS["boas-vindas"].prioridade)
  })

  it("o de 7 dias sai quando chega a hora; o que acabou antes de ligar, não", () => {
    const ligou = haDias(1)
    const entrada = (acaba: Date) => ({
      fluxo: "reposicao" as const,
      chave: "order_1|fator",
      email: EMAIL,
      comeco: acaba,
      inicio: acaba,
      comprou: false,
    })
    const acaba = new Date(AGORA.getTime() + 7 * DIA - 60 * 1000)
    const r = decidir({
      entradas: [entrada(acaba)],
      registros: [],
      ligados: { reposicao: ligou },
      agora: AGORA,
    })
    expect(["mandar", "controle"]).toContain(r?.decisao.tipo)
    expect(r?.decisao.tipo === "nada" ? null : r?.decisao.toque.id).toBe("reposicao-antes-7d")
    expect(
      decidir({
        entradas: [entrada(haDias(3))],
        registros: [],
        ligados: { reposicao: ligou },
        agora: AGORA,
      })
    ).toBeNull()
  })
})
