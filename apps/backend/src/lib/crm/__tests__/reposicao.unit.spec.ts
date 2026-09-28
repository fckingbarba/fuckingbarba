import { DIAS_PADRAO, type PedidoDaPessoa } from "../etiquetas"
import { decidir, FLUXOS, lerConfigDosFluxos } from "../fluxos"
import {
  avisoDaReposicao,
  diasAteAcabar,
  naJanelaDaReposicao,
  reposicoesDaPessoa,
  textoDoAviso,
  type PedidoDaReposicao,
  type Reposicao,
} from "../reposicao"

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

describe("o aviso no site (0188)", () => {
  // AGORA é 28/09, meio-dia em Brasília.
  it("os dias contam no calendário de Brasília: hoje, amanhã, ontem", () => {
    const em = (iso: string) => diasAteAcabar(new Date(iso), AGORA)
    expect(em("2026-09-29T02:00:00Z")).toBe(0) // 28/09, 23h em Brasília
    expect(em("2026-09-29T03:30:00Z")).toBe(1) // 29/09, 0h30
    expect(em("2026-10-03T20:00:00Z")).toBe(5)
    expect(em("2026-09-28T02:00:00Z")).toBe(-1) // 27/09, 23h
  })

  it("o texto: acaba em N dias, amanhã, hoje; depois, acabou?", () => {
    expect(textoDoAviso("fator", 5).titulo).toBe("Seu Fator de Crescimento acaba em 5 dias")
    expect(textoDoAviso("pasta", 1).titulo).toBe("Sua pasta modeladora acaba amanhã")
    expect(textoDoAviso("oleo", 0).titulo).toBe("Seu óleo acaba hoje")
    expect(textoDoAviso("oleo", -1)).toEqual({
      titulo: "Acabou o óleo?",
      texto: "Pelas nossas contas, acabou ontem. Se ainda não repôs, o botão monta o mesmo pedido.",
    })
    expect(textoDoAviso("pasta", -3).texto).toContain("acabou há 3 dias")
    // Sem palavra de propaganda, como os e-mails da reposição.
    for (const d of [7, 1, 0, -1, -10]) {
      const { titulo, texto } = textoDoAviso("fator", d)
      expect(`${titulo} ${texto}`).not.toMatch(/grátis|desconto|oferta|promo|imperd|cupom/i)
    }
  })

  const rep = (
    componente: Reposicao["componente"],
    dias: number,
    skus: string[],
    pedido = `order_${componente}`
  ): Reposicao => ({
    email: EMAIL,
    componente,
    pedido,
    skus,
    acaba: new Date(AGORA.getTime() + dias * DIA),
  })
  const produto = (handle: string) => ({ nome: handle, handle, imagem: null })
  const LOJA = new Map([
    ["FBFCB01", produto("fator-de-crescimento")],
    ["FBOL01", produto("oleo-para-barba")],
    ["FBKIT01", produto("kit-completo")],
  ])
  const voltar = (pedido: string) => `/voltar/t-${pedido}`

  it("de vários, o que acaba primeiro — o que já acabou vem antes; só dentro da janela", () => {
    const aviso = avisoDaReposicao(
      [rep("fator", 5, ["FBFCB01"]), rep("oleo", -2, ["FBKIT01"]), rep("balm", -30, ["FBKIT01"])],
      LOJA,
      voltar,
      AGORA
    )
    expect(aviso).toMatchObject({
      componente: "oleo",
      pedido: "order_oleo",
      titulo: "Acabou o óleo?",
      dias: -2,
      produto: { handle: "kit-completo" },
      voltar: "/voltar/t-order_oleo",
      chave: "oleo.2026-09-26",
    })
    // Fora da janela (acaba em 20 dias), nada.
    expect(avisoDaReposicao([rep("fator", 20, ["FBFCB01"])], LOJA, voltar, AGORA)).toBeNull()
    expect(avisoDaReposicao([], LOJA, voltar, AGORA)).toBeNull()
  })

  it("sem produto da última compra à venda, pula pro próximo; no empate, o Fator primeiro", () => {
    const aviso = avisoDaReposicao(
      [rep("shampoo", 1, ["FBSH-VELHO"]), rep("oleo", 3, ["FBOL01"]), rep("fator", 3, ["FBFCB01"])],
      LOJA,
      voltar,
      AGORA
    )
    expect(aviso).toMatchObject({ componente: "fator", dias: 3 })
    expect(avisoDaReposicao([rep("shampoo", 1, ["FBSH-VELHO"])], LOJA, voltar, AGORA)).toBeNull()
  })
})
