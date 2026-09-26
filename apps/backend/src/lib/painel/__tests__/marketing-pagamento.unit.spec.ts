import { RECUSAS } from "../../../modules/pagarme/situacao"
import { janelasDo } from "../marketing"
import {
  montarPagamento,
  type CarrinhoDoPagamento,
  type PedidoDoPagamento,
} from "../marketing-pagamento"

/**
 * O pagamento e o frete do Marketing: como pagaram, o Pix que venceu, o
 * cartão por motivo (a frase da recusa), as parcelas, o frete grátis, quem
 * desiste no frete, o "quase lá" e os achados. A hora é de Brasília:
 * 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`).toISOString()
const GRATIS = { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null } as const

/** A sessão do Pagar.me, com o estado que ele grava. */
const sessao = (
  forma: "pix" | "cartao",
  situacao: string,
  c: { parcelas?: number; recusa?: string; status?: string; expira?: string } = {}
) => ({
  provider_id: "pp_pagarme_pagarme",
  status:
    c.status ??
    (situacao === "pago" ? "captured" : situacao === "recusado" ? "error" : "authorized"),
  data: {
    pagarme: {
      forma,
      situacao,
      parcelas: c.parcelas ?? 1,
      recusa: c.recusa ?? null,
      pix: c.expira ? { copiaECola: "000201", imagem: "", expiraEm: em(c.expira) } : null,
    },
  },
})

let n = 0
function pedido(p: {
  criado: string
  sessao: ReturnType<typeof sessao>
  pago?: boolean
  /** Quando foi pago, se não na hora do pedido. */
  pagoEm?: string
  total?: number
  frete?: number
  produtos?: number
  status?: string
}): PedidoDoPagamento {
  n++
  return {
    id: `order_${n}`,
    created_at: em(p.criado),
    status: p.status ?? "pending",
    total: p.total ?? 100,
    shipping_total: p.frete ?? 0,
    item_subtotal: p.produtos ?? (p.total ?? 100) - (p.frete ?? 0),
    payment_collections: [
      {
        payment_sessions: [p.sessao],
        payments: p.pago ? [{ captured_at: em(p.pagoEm ?? p.criado) }] : [],
      },
    ],
  }
}

const carrinho = (
  criado: string,
  c: Partial<CarrinhoDoPagamento> & { sessoes?: ReturnType<typeof sessao>[] } = {}
): CarrinhoDoPagamento => ({
  id: `cart_${++n}`,
  created_at: em(criado),
  payment_collection: { payment_sessions: c.sessoes ?? [] },
  ...c,
})

describe("o pagamento", () => {
  const pedidos = [
    pedido({ criado: "2026-09-23 10:00", sessao: sessao("pix", "pago"), pago: true }),
    pedido({ criado: "2026-09-23 11:00", sessao: sessao("pix", "aguardando") }),
    // Pix de 20 minutos atrás: ainda esperando.
    pedido({ criado: "2026-09-24 11:40", sessao: sessao("pix", "aguardando") }),
    pedido({
      criado: "2026-09-22 10:00",
      sessao: sessao("cartao", "pago", { parcelas: 3 }),
      pago: true,
    }),
    pedido({
      criado: "2026-09-22 11:00",
      sessao: sessao("cartao", "pago", { parcelas: 1 }),
      pago: true,
    }),
    pedido({ criado: "2026-09-21 10:00", sessao: sessao("cartao", "analise") }),
    // Feito antes do período (o cartão ficou em análise) e pago dentro: é pago do período, como
    // no Resumo; a tentativa, não (foi antes).
    pedido({
      criado: "2026-09-17 22:00",
      pagoEm: "2026-09-18 09:00",
      sessao: sessao("cartao", "pago", { parcelas: 3 }),
      pago: true,
    }),
    // Barrado pela análise depois do pedido (o pedido existe, cancelado).
    pedido({
      criado: "2026-09-21 11:00",
      sessao: sessao("cartao", "recusado", { recusa: RECUSAS.antifraude }),
      status: "canceled",
    }),
  ]
  const carrinhos = [
    carrinho("2026-09-22 09:00", {
      sessoes: [sessao("cartao", "recusado", { recusa: RECUSAS.banco })],
    }),
    carrinho("2026-09-22 09:30", {
      sessoes: [sessao("cartao", "recusado", { recusa: RECUSAS.dados })],
    }),
    carrinho("2026-09-22 09:40", {
      sessoes: [sessao("cartao", "recusado", { recusa: RECUSAS.antifraude })],
    }),
    // A sessão nova (nada enviado) não é tentativa; o carrinho que fechou já contou no pedido.
    carrinho("2026-09-22 09:50", { sessoes: [sessao("cartao", "nova")] }),
    carrinho("2026-09-22 09:55", {
      completed_at: em("2026-09-22 10:00"),
      sessoes: [sessao("cartao", "pago")],
    }),
  ]
  const p = montarPagamento(pedidos, carrinhos, GRATIS, SETE, AGORA)

  it("como pagaram: os pedidos pagos no período (os do Resumo), pela forma", () => {
    expect(p.comoPagaram).toEqual({ pix: 1, cartao: 3 })
  })

  it("o Pix: pago, vencido (mais de uma hora) e esperando", () => {
    expect(p.pix).toEqual({ gerados: 3, pagos: 1, venceram: 1, esperando: 1 })
  })

  it("o Pix vence na hora que o Pagar.me deu, e o pedido cancelado sem pagar venceu", () => {
    const pix = montarPagamento(
      [
        // 20 minutos atrás, com 5 minutos pra pagar: já venceu.
        pedido({
          criado: "2026-09-24 11:40",
          sessao: sessao("pix", "aguardando", { expira: "2026-09-24 11:45" }),
        }),
        // Duas horas atrás, com três horas pra pagar: ainda esperando.
        pedido({
          criado: "2026-09-24 10:00",
          sessao: sessao("pix", "aguardando", { expira: "2026-09-24 13:00" }),
        }),
        // Cancelado sem pagar, 10 minutos atrás: não se paga mais.
        pedido({
          criado: "2026-09-24 11:50",
          sessao: sessao("pix", "aguardando"),
          status: "canceled",
        }),
      ],
      [],
      GRATIS,
      SETE,
      AGORA
    ).pix
    expect(pix).toEqual({ gerados: 3, pagos: 0, venceram: 2, esperando: 1 })
  })

  it("o cartão: cada tentativa (do pedido e do carrinho que não fechou), pelo motivo da recusa", () => {
    expect(p.cartao).toEqual({
      total: 7,
      aprovados: 2,
      emAnalise: 1,
      antifraude: 2,
      banco: 1,
      dados: 1,
      outros: 0,
    })
  })

  it("as parcelas dos pedidos pagos no cartão", () => {
    expect(p.parcelas).toEqual([
      { parcelas: 1, pedidos: 1 },
      { parcelas: 3, pedidos: 2 },
    ])
  })
})

describe("o frete", () => {
  it("o grátis, o médio de quem pagou, quem desiste e o quase lá", () => {
    const pedidos = [
      pedido({
        criado: "2026-09-23 10:00",
        sessao: sessao("pix", "pago"),
        pago: true,
        total: 160,
        frete: 0,
      }),
      // Pagou R$ 20 de frete com R$ 130 de produtos: quase lá (a R$ 19,90 do piso).
      pedido({
        criado: "2026-09-23 11:00",
        sessao: sessao("pix", "pago"),
        pago: true,
        total: 150,
        frete: 20,
      }),
      // Pagou frete com R$ 80: longe do piso.
      pedido({
        criado: "2026-09-23 12:00",
        sessao: sessao("pix", "pago"),
        pago: true,
        total: 104,
        frete: 24,
      }),
    ]
    const carrinhos = [
      carrinho("2026-09-22 09:00", {
        shipping_address: { postal_code: "01001000" },
        shipping_methods: [{ id: "sm" }],
      }),
      carrinho("2026-09-22 09:10", { shipping_address: { postal_code: "01001000" } }),
      carrinho("2026-09-22 09:20", { shipping_address: { postal_code: "01001000" } }),
      carrinho("2026-09-22 09:30", { shipping_address: { postal_code: "01001000" } }),
      carrinho("2026-09-22 09:40"),
    ]
    expect(montarPagamento(pedidos, carrinhos, GRATIS, SETE, AGORA).frete).toEqual({
      pedidos: 3,
      gratis: 1,
      parteGratis: 33,
      medioPago: 22,
      desistem: 75,
      quaseLa: 1,
      piso: 149.9,
    })
    // Sem frete grátis na loja: não há "quase lá".
    expect(
      montarPagamento(pedidos, carrinhos, { modo: "nenhuma" }, SETE, AGORA).frete
    ).toMatchObject({
      quaseLa: null,
      piso: null,
    })
  })
})

describe("os achados", () => {
  it("o cartão recusado (e por quem), o Pix que vence e o quase lá", () => {
    const pedidos = [
      ...Array.from({ length: 6 }, () =>
        pedido({
          criado: "2026-09-22 10:00",
          sessao: sessao("cartao", "pago"),
          pago: true,
          total: 140,
          frete: 20,
        })
      ),
      ...Array.from({ length: 12 }, () =>
        pedido({ criado: "2026-09-22 10:00", sessao: sessao("pix", "aguardando") })
      ),
    ]
    const carrinhos = Array.from({ length: 5 }, () =>
      carrinho("2026-09-22 09:00", {
        sessoes: [sessao("cartao", "recusado", { recusa: RECUSAS.antifraude })],
      })
    )
    const { achados } = montarPagamento(pedidos, carrinhos, GRATIS, SETE, AGORA)
    // O "R$" do Intl vem com o espaço fixo: aqui, espaço comum.
    expect(achados.map((a) => a.titulo.replace(/\s/g, " "))).toEqual([
      "5 de 11 tentativas no cartão foram recusadas",
      "12 de 12 Pix gerados venceram sem pagar",
      "6 pedidos pagaram frete a menos de R$ 30,00 do grátis",
    ])
    expect(achados[0].texto).toMatch(/análise de fraude/)
  })

  it("com pouca tentativa, diz que ainda é cedo", () => {
    const { achados } = montarPagamento([], [], GRATIS, SETE, AGORA)
    expect(achados).toEqual([
      expect.objectContaining({ tipo: "info", titulo: "Ainda é pouco pra olhar o pagamento" }),
    ])
  })
})
