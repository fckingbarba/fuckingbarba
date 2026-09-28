import { DIAS_PADRAO, type PedidoDaPessoa } from "../etiquetas"
import { ALVO_PADRAO, diaDoPasso, fichaDoSite, type FichaDoFator } from "../ficha-do-site"
import type { PedidoDaReposicao } from "../reposicao"

/**
 * A ficha do site (0190): o dia do tratamento (o Fator em uso, sem parar), as
 * compras de cada produto e o que combina com o que a pessoa já tem.
 */

const DIA = 24 * 60 * 60 * 1000
// 28/09, meio-dia em Brasília.
const AGORA = new Date("2026-09-28T15:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)
const EMAIL = "rafael@exemplo.com"

const pedido = (
  ref: string,
  pagoHa: number,
  itens: [string, string | null, number?][],
  extra: Partial<PedidoDaPessoa> = {}
): PedidoDaReposicao => ({
  id: ref,
  ref,
  numero: null,
  pagoEm: haDias(pagoHa),
  entregueEm: null,
  cancelado: false,
  itens: itens.map(([sku, handle, quantidade = 1]) => ({ sku, handle, nome: sku, quantidade })),
  cupons: [],
  ...extra,
})

const produto = (handle: string) => ({ nome: handle, handle, imagem: null })
const POR_SKU = new Map([
  ["FBFCB01", produto("fator-de-crescimento-para-barba")],
  ["FBOL01", produto("oleo-para-barba")],
  ["FBSH01", produto("shampoo-para-barba")],
  ["FBKIT01", produto("kit-completo-para-barba")],
  ["FBKIT06", produto("kit-3-fatores")],
])

const FATOR: FichaDoFator = {
  handle: "fator-de-crescimento-para-barba",
  comLinhaDoTempo: true,
  passos: [
    { quando: "Semanas 1 e 2", titulo: "Textura", texto: "O fio fica mais forte ao toque." },
    { quando: "Dia 30", titulo: "Começa a encher", texto: "Primeiros fios novos." },
    { quando: "Dia 90", titulo: "Densidade", texto: "Barba mais cheia.", alvo: true },
    { quando: "3 a 6 meses", titulo: "Resultado cheio", texto: "O máximo da genética." },
  ],
}

const ficha = (pedidos: PedidoDaReposicao[], fator: FichaDoFator | null = FATOR) =>
  fichaDoSite({
    email: EMAIL,
    pedidos,
    dias: DIAS_PADRAO,
    tolerancia: 20,
    porSku: POR_SKU,
    fator,
    voltar: (p) => `/voltar/t-${p}`,
    agora: AGORA,
  })

describe("o dia de cada marco da linha do tempo", () => {
  it("lê o que o dono escreve: dias, semanas e meses (o fim da faixa)", () => {
    expect(
      [
        "Semanas 1 e 2",
        "Dia 30",
        "Dia 90",
        "3 a 6 meses",
        "1 mês",
        "45 dias",
        "2 semanas",
        "Logo",
      ].map(diaDoPasso)
    ).toEqual([14, 30, 90, 180, 30, 45, 14, null])
  })
})

describe("o dia do tratamento", () => {
  it("conta da chegada do Fator (o dia dela é o 1), com o próximo marco e o alvo da linha do tempo", () => {
    // Pago há 29 dias, sem o aviso de entrega: chegou no 7º (há 22 dias) — hoje é o dia 23.
    const t = ficha([
      pedido("order_1", 29, [["FBFCB01", "fator-de-crescimento-para-barba"]]),
    ]).tratamento
    expect(t).toEqual({
      dia: 23,
      alvo: 90,
      marco: { quando: "Dia 30", titulo: "Começa a encher", texto: "Primeiros fios novos." },
      handle: "fator-de-crescimento-para-barba",
      linhaDoTempo: true,
    })
    // Sem a linha do tempo na página: o dia e o alvo de sempre, sem marco, e o link sem a âncora.
    expect(
      ficha([pedido("order_1", 29, [["FBFCB01", null]])], {
        ...FATOR,
        passos: [],
        comLinhaDoTempo: false,
      }).tratamento
    ).toEqual({
      dia: 23,
      alvo: ALVO_PADRAO,
      marco: null,
      handle: "fator-de-crescimento-para-barba",
      linhaDoTempo: false,
    })
  })

  it("some quando o Fator acaba, e não começa antes de ele chegar", () => {
    // Um Fator entregue há 31 dias: acabou ontem — agora quem fala é a reposição.
    const acabou = ficha([pedido("order_1", 40, [["FBFCB01", null]], { entregueEm: haDias(31) })])
    expect(acabou.tratamento).toBeNull()
    expect(acabou.reposicao?.titulo).toBe("Acabou o Fator de Crescimento?")
    // Pago há 3 dias: ainda a caminho.
    expect(ficha([pedido("order_1", 3, [["FBFCB01", null]])]).tratamento).toBeNull()
    // Sem Fator nenhum.
    expect(ficha([pedido("order_1", 20, [["FBOL01", null]])]).tratamento).toBeNull()
  })

  it("a compra que chega antes de o anterior acabar (mais a tolerância) continua a mesma sequência", () => {
    // O 1º chegou há 45 dias (acabou há 15); o 2º, há 5: dentro dos 20 de tolerância — dia 46.
    const seguido = ficha([
      pedido("nso_1", 52, [["FBFCB01", null]], { entregueEm: haDias(45) }),
      pedido("order_2", 10, [["FBFCB01", null]], { entregueEm: haDias(5) }),
    ]).tratamento
    expect(seguido?.dia).toBe(46)
    expect(seguido?.marco?.quando).toBe("Dia 90")
    // O 1º acabou há 60 dias: o tratamento recomeçou com o 2º — dia 6.
    const parou = ficha([
      pedido("nso_1", 97, [["FBFCB01", null]], { entregueEm: haDias(90) }),
      pedido("order_2", 10, [["FBFCB01", null]], { entregueEm: haDias(5) }),
    ]).tratamento
    expect(parou?.dia).toBe(6)
    expect(parou?.marco?.quando).toBe("Semanas 1 e 2")
  })

  it("o kit de 3 Fatores dura 90 dias, e depois do último marco não há próximo", () => {
    const t = ficha([
      pedido("order_1", 87, [["FBKIT06", "kit-3-fatores"]], { entregueEm: haDias(80) }),
    ]).tratamento
    expect(t?.dia).toBe(81)
    // Três compras seguidas (3 + 3 + 1 Fatores), a primeira chegou há 195 dias: dia 196.
    const longe = ficha([
      pedido("order_1", 202, [["FBKIT06", null]], { entregueEm: haDias(195) }),
      pedido("order_2", 107, [["FBKIT06", null]], { entregueEm: haDias(100) }),
      pedido("order_3", 19, [["FBFCB01", null]], { entregueEm: haDias(12) }),
    ]).tratamento
    expect(longe?.dia).toBe(196)
    expect(longe?.marco).toBeNull()
  })
})

describe("as compras e o que combina", () => {
  it("a última compra de cada produto: o da loja nova pelo endereço, o da Nuvemshop pelo SKU", () => {
    const { compras } = ficha([
      pedido("nso_1", 60, [["FBFCB01", null]]),
      pedido("order_2", 25, [["FBFCB01", "fator-de-crescimento-para-barba"]]),
      pedido("nso_3", 40, [
        ["FBOL01", null],
        ["SEM-LOJA", null],
      ]),
      // Cancelado e não pago não contam.
      pedido("order_4", 2, [["FBSH01", "shampoo-para-barba"]], { cancelado: true }),
      pedido("order_5", 1, [["FBKIT01", "kit-completo-para-barba"]], { pagoEm: null }),
    ])
    expect(compras).toEqual(
      expect.arrayContaining([
        { handle: "fator-de-crescimento-para-barba", dias: 25 },
        { handle: "oleo-para-barba", dias: 40 },
      ])
    )
    expect(compras).toHaveLength(2)
  })

  it("quem tem o Fator (1 só) vê o óleo e os 3 Fatores, com o porquê — nunca o que já comprou", () => {
    expect(ficha([pedido("order_1", 10, [["FBFCB01", null]])]).combina).toEqual([
      { handle: "oleo-para-barba", porque: "Combina com o Fator que você já tem" },
      { handle: "kit-3-fatores", porque: "Os 90 dias do tratamento, de uma vez" },
    ])
    // Com o Fator e o óleo: o shampoo; o de 3 Fatores já veio.
    expect(
      ficha([
        pedido("order_1", 10, [
          ["FBKIT06", null],
          ["FBOL01", null],
        ]),
      ]).combina.map((c) => c.handle)
    ).toEqual(["shampoo-para-barba", "kit-completo-para-barba"])
    // Quem ainda não comprou nada não vê sugestão.
    expect(ficha([]).combina).toEqual([])
  })
})
