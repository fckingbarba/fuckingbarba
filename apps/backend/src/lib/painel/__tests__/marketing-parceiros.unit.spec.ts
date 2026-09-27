import { janelasDo } from "../marketing"
import { montarPagamento, type PedidoDoPagamento } from "../marketing-pagamento"
import {
  MINIMO_PRA_COMPARAR,
  rankingDosParceiros,
  type TentativaDoPeriodo,
} from "../marketing-parceiros"

/**
 * Os parceiros de pagamento lado a lado: os Pix de cada um (dos pedidos), o
 * que não gerou e quanto demora (das tentativas), as quedas pela regra do
 * disjuntor, o "sem vencedor sem volume" e o achado do parceiro fora do ar.
 * A hora é de Brasília: 24/09/2026, 15:00 aqui = 18:00 UTC.
 */

const AGORA = new Date("2026-09-24T18:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}-03:00`)
const PAGARME = "pp_pagarme_pagarme"
const MP = "pp_mercadopago_mercadopago"
const GRATIS = { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null } as const

const sessao = (provedor: string, forma: "pix" | "cartao", situacao: string) => ({
  provider_id: provedor,
  status: situacao === "pago" ? "captured" : "authorized",
  data: {
    [provedor === MP ? "mercadopago" : "pagarme"]: { forma, situacao, parcelas: 1, recusa: null },
  },
})

let n = 0
function pedido(
  provedor: string,
  forma: "pix" | "cartao",
  criado: string,
  pagoEm: string | null = null
): PedidoDoPagamento {
  n++
  return {
    id: `order_${n}`,
    created_at: em(criado).toISOString(),
    status: "pending",
    total: 100,
    shipping_total: 0,
    item_subtotal: 100,
    payment_collections: [
      {
        payment_sessions: [sessao(provedor, forma, pagoEm ? "pago" : "aguardando")],
        payments: pagoEm ? [{ captured_at: em(pagoEm).toISOString() }] : [],
      },
    ],
  }
}

/** Uma tentativa: o parceiro, a forma, como terminou, e quando (começo e fim, "hh:mm:ss"). */
const tentativa = (
  provedor: string,
  resultado: string,
  motivo: string | null,
  inicio: string,
  segundos = 2,
  forma = "pix"
): TentativaDoPeriodo => ({
  provedor,
  forma,
  resultado,
  motivo,
  inicio: em(`2026-09-24 ${inicio}`),
  fim: new Date(em(`2026-09-24 ${inicio}`).getTime() + segundos * 1000),
})

const doParceiro = (r: ReturnType<typeof rankingDosParceiros>, id: string) =>
  r.ranking.parceiros.find((p) => p.id === id)!

describe("os Pix de cada parceiro", () => {
  const pedidos = [
    pedido(PAGARME, "pix", "2026-09-24 09:00", "2026-09-24 09:10"),
    pedido(PAGARME, "pix", "2026-09-24 10:00", "2026-09-24 10:30"),
    pedido(PAGARME, "pix", "2026-09-24 11:00"),
    pedido(MP, "pix", "2026-09-24 12:00", "2026-09-24 12:05"),
    pedido(PAGARME, "cartao", "2026-09-24 13:00", "2026-09-24 13:00"),
  ]

  it("gerados e pagos vêm dos pedidos, separados — e somados dão os do bloco Pix", () => {
    const r = rankingDosParceiros(pedidos, [], SETE, AGORA)
    expect(doParceiro(r, PAGARME).pix).toMatchObject({ gerados: 3, pagos: 2 })
    expect(doParceiro(r, MP).pix).toMatchObject({ gerados: 1, pagos: 1 })
    const tudo = montarPagamento(pedidos, [], GRATIS, SETE, AGORA)
    const soma = tudo.parceiros.parceiros.reduce(
      (s, p) => ({ gerados: s.gerados + p.pix.gerados, pagos: s.pagos + p.pix.pagos }),
      { gerados: 0, pagos: 0 }
    )
    expect(soma).toEqual({ gerados: tudo.pix.gerados, pagos: tudo.pix.pagos })
  })

  it("do pedido ao pagamento: a mediana, em minutos", () => {
    const r = rankingDosParceiros(pedidos, [], SETE, AGORA)
    expect(doParceiro(r, PAGARME).pix.atePagar).toBe(20)
    expect(doParceiro(r, MP).pix.atePagar).toBe(5)
  })

  it("o que não gerou, o tempo pra gerar e o 'sem resposta' vêm das tentativas", () => {
    const r = rankingDosParceiros(
      pedidos,
      [
        tentativa(PAGARME, "gerado", null, "09:00:00", 1),
        tentativa(PAGARME, "gerado", null, "10:00:00", 3),
        tentativa(PAGARME, "erro", "fora", "11:30:00", 10),
        tentativa(PAGARME, "erro", "recusa", "11:40:00", 1),
        tentativa(MP, "gerado", null, "12:00:00", 2.5),
        tentativa(PAGARME, "recusada", "banco", "13:00:00", 4, "cartao"),
      ],
      SETE,
      AGORA
    )
    expect(doParceiro(r, PAGARME).pix).toMatchObject({ naoGeraram: 2, praGerar: 2 })
    expect(doParceiro(r, MP).pix).toMatchObject({ naoGeraram: 0, praGerar: 2.5 })
    // Só o que ele não respondeu: a recusa (Pix e cartão) é ele atendendo.
    expect(doParceiro(r, PAGARME).semResposta).toBe(1)
  })

  it("quem não cobrou nem foi tentado no período fica marcado", () => {
    const r = rankingDosParceiros([pedido(PAGARME, "pix", "2026-09-24 09:00")], [], SETE, AGORA)
    expect(doParceiro(r, PAGARME).usado).toBe(true)
    expect(doParceiro(r, MP)).toMatchObject({
      usado: false,
      pix: { gerados: 0, pagos: 0, naoGeraram: 0, praGerar: null, atePagar: null },
    })
  })
})

describe("fora do ar: a regra do disjuntor", () => {
  it("três seguidas sem resposta são uma queda, até a primeira que ele atendeu", () => {
    const r = rankingDosParceiros(
      [],
      [
        tentativa(PAGARME, "erro", "fora", "12:00:00"),
        tentativa(PAGARME, "erro", "incerto", "12:02:00"),
        tentativa(PAGARME, "erro", "fora", "12:04:00"),
        tentativa(PAGARME, "gerado", null, "12:10:00"),
      ],
      SETE,
      AGORA
    )
    expect(doParceiro(r, PAGARME).fora).toEqual({ vezes: 1, minutos: 10 })
    expect(doParceiro(r, PAGARME).semResposta).toBe(3)
  })

  it("duas não são queda; a que não acabou vai até agora", () => {
    const duas = rankingDosParceiros(
      [],
      [
        tentativa(PAGARME, "erro", "fora", "12:00:00"),
        tentativa(PAGARME, "erro", "fora", "12:02:00"),
        tentativa(PAGARME, "gerado", null, "12:03:00"),
      ],
      SETE,
      AGORA
    )
    expect(doParceiro(duas, PAGARME).fora).toEqual({ vezes: 0, minutos: 0 })
    const semFim = rankingDosParceiros(
      [],
      [
        tentativa(PAGARME, "erro", "fora", "14:00:00"),
        tentativa(PAGARME, "erro", "fora", "14:10:00"),
        tentativa(PAGARME, "erro", "fora", "14:20:00"),
      ],
      SETE,
      AGORA
    )
    expect(doParceiro(semFim, PAGARME).fora).toEqual({ vezes: 1, minutos: 60 })
  })

  it("a queda de segundos é 'menos de 1 min' no achado — e não '0 min'", () => {
    const p = montarPagamento([], [], GRATIS, SETE, AGORA, [
      tentativa(PAGARME, "erro", "fora", "12:00:00"),
      tentativa(PAGARME, "erro", "fora", "12:00:10"),
      tentativa(PAGARME, "erro", "fora", "12:00:20"),
      tentativa(PAGARME, "gerado", null, "12:00:40"),
    ])
    expect(p.parceiros.parceiros[0].fora).toEqual({ vezes: 1, minutos: 0 })
    expect(p.achados.map((a) => a.titulo)).toContain(
      "O Pagar.me ficou fora do ar 1 vez no período (menos de 1 min)"
    )
  })

  it("o achado: quanto tempo ficou fora, e quantos Pix saíram pelo outro nesse tempo", () => {
    const anotadas = [
      tentativa(PAGARME, "erro", "fora", "12:00:00"),
      tentativa(MP, "gerado", null, "12:00:05"),
      tentativa(PAGARME, "erro", "fora", "12:02:00"),
      tentativa(MP, "gerado", null, "12:02:05"),
      tentativa(PAGARME, "erro", "fora", "12:04:00"),
      tentativa(MP, "gerado", null, "12:05:00"),
      tentativa(PAGARME, "gerado", null, "12:10:00"),
      // Depois da volta: não conta como "nesse tempo".
      tentativa(MP, "gerado", null, "13:00:00"),
    ]
    const p = montarPagamento([], [], GRATIS, SETE, AGORA, anotadas)
    const achado = p.achados.find((a) => /ficou fora do ar/.test(a.titulo))
    expect(achado).toEqual({
      tipo: "problema",
      titulo: "O Pagar.me ficou fora do ar 1 vez no período (10 min)",
      texto:
        "Nesse tempo, 3 Pix saíram pelo Mercado Pago. Três tentativas seguidas sem resposta " +
        "tiram o parceiro do caminho por 5 minutos. Se virar rotina, vale chamar o suporte do " +
        "Pagar.me.",
    })
    // Com o parceiro fora do ar pra contar, o "ainda é pouco pra olhar" não aparece.
    expect(p.achados.some((a) => a.tipo === "info")).toBe(false)
  })
})

describe("quem gera mais Pix: sem vencedor sem volume", () => {
  const tentativas = (provedor: string, geraram: number, falharam: number) => [
    ...Array.from({ length: geraram }, () => tentativa(provedor, "gerado", null, "09:00:00")),
    ...Array.from({ length: falharam }, () => tentativa(provedor, "erro", "recusa", "09:00:00")),
  ]
  const pedidosDe = (provedor: string, quantos: number) =>
    Array.from({ length: quantos }, () => pedido(provedor, "pix", "2026-09-24 09:00"))

  it(`com ${MINIMO_PRA_COMPARAR} tentativas de Pix em cada um, o que gera mais`, () => {
    const r = rankingDosParceiros(
      [...pedidosDe(PAGARME, 11), ...pedidosDe(MP, 9)],
      [...tentativas(PAGARME, 11, 1), ...tentativas(MP, 9, 3)],
      SETE,
      AGORA
    )
    expect(r.ranking.melhorNoPix).toEqual({
      nome: "Pagar.me",
      parte: 92,
      outro: "Mercado Pago",
      parteDoOutro: 75,
    })
  })

  it("com menos que isso num deles, ou empatados, ninguém ganha", () => {
    const pouco = rankingDosParceiros(
      [...pedidosDe(PAGARME, 11), ...pedidosDe(MP, 4)],
      [...tentativas(PAGARME, 11, 1), ...tentativas(MP, 4, 1)],
      SETE,
      AGORA
    )
    expect(pouco.ranking.melhorNoPix).toBeNull()
    const empate = rankingDosParceiros(
      [...pedidosDe(PAGARME, 10), ...pedidosDe(MP, 10)],
      [...tentativas(PAGARME, 10, 0), ...tentativas(MP, 10, 0)],
      SETE,
      AGORA
    )
    expect(empate.ranking.melhorNoPix).toBeNull()
  })
})
