import {
  ateOndeFoi,
  checkoutDoPeriodo,
  MARCA_DO_CHECKOUT,
  montarInicioNoPeriodo,
  vendasDaNuvemshop,
  type CarrinhoDoCheckout,
  type DadosDoPeriodo,
  type ProdutoComSku,
} from "../inicio-periodo"
import type { PedidoCru } from "../pedido"
import { lerPeriodo } from "../periodo"

/**
 * O Início no período (0186): as vendas das duas lojas (a nova e a
 * Nuvemshop), os números contra o de antes, o gráfico, os mais vendidos e o
 * checkout passo a passo. A hora é de Brasília: 28/09/2026, 15:40 = 18:40 UTC.
 */

const AGORA = new Date("2026-09-28T18:40:00.000Z")
/** Um instante em Brasília: "2026-09-24 10:30". */
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`).toISOString()

const OLEO: ProdutoComSku = {
  id: "prod_oleo",
  titulo: "Óleo para Barba — 30ml",
  imagem: "https://fotos/oleo.webp",
  skus: ["FB-OLEO"],
}
const BALM: ProdutoComSku = {
  id: "prod_balm",
  titulo: "Balm para Barba",
  imagem: null,
  skus: ["fb-balm "],
}

function pago(
  id: string,
  pagoEm: string,
  total: number,
  itens: { produto: string; nome: string; unidades: number }[] = [],
  status = "pending"
): PedidoCru {
  return {
    id,
    created_at: pagoEm,
    status,
    total,
    items: itens.map((i, k) => ({
      id: `${id}-${k}`,
      product_id: i.produto,
      product_title: i.nome,
      quantity: i.unidades,
      thumbnail: null,
    })),
    payment_collections: [{ payments: [{ amount: total, captured_at: pagoEm }] }],
  }
}

const semNada: DadosDoPeriodo = {
  pedidos: [],
  daNuvemshop: [],
  produtos: [OLEO, BALM],
  carrinhos: null,
  feitos: null,
}

describe("as vendas da Nuvemshop", () => {
  it("viram vendas da loja nova: o produto de hoje pelo SKU, o total em reais, o dia do pagamento", () => {
    const [v] = vendasDaNuvemshop(
      [
        {
          numero: "3190",
          pagoEm: em("2026-09-20 11:00"),
          feitoEm: em("2026-09-20 10:50"),
          total: 12990,
          itens: [
            { sku: "fb-oleo", nome: "Óleo 30ml", quantidade: 2, valor: 59.9 },
            { sku: "FB-BALM", nome: "Balm", quantidade: 1, valor: 45 },
            { sku: "FB-SUMIU", nome: "Pente de madeira — FuckingBarba", quantidade: 1, valor: 20 },
            { sku: "FB-OLEO", quantidade: 0 },
          ],
        },
      ],
      [OLEO, BALM]
    )
    expect(v).toMatchObject({ id: "nuvemshop:3190", total: 129.9 })
    expect(v.pagoEm).toEqual(new Date(em("2026-09-20 11:00")))
    expect(v.itens).toEqual([
      expect.objectContaining({
        produto: "prod_oleo",
        nome: "Óleo",
        imagem: "https://fotos/oleo.webp",
        unidades: 2,
        receita: 119.8,
      }),
      expect.objectContaining({ produto: "prod_balm", nome: "Balm", unidades: 1 }),
      expect.objectContaining({ produto: "sku:FB-SUMIU", nome: "Pente de madeira", unidades: 1 }),
    ])
  })

  it("sem o dia do pagamento, conta o do pedido", () => {
    const [v] = vendasDaNuvemshop(
      [{ numero: "1", pagoEm: null, feitoEm: em("2026-09-01 09:00"), total: 100, itens: [] }],
      []
    )
    expect(v.pagoEm).toEqual(new Date(em("2026-09-01 09:00")))
    expect(v.total).toBe(1)
  })
})

describe("os números do período", () => {
  it("as duas lojas somam; o pago e cancelado não; o de antes para na mesma hora", () => {
    const p = lerPeriodo({ periodo: "7d" }, AGORA)
    const i = montarInicioNoPeriodo(
      p,
      {
        ...semNada,
        pedidos: [
          pago("order_1", em("2026-09-28 10:00"), 100),
          pago("order_2", em("2026-09-27 21:00"), 50),
          pago("order_3", em("2026-09-26 12:00"), 80, [], "canceled"),
          // O de antes: dentro até as 15:40 do dia 21, e fora depois.
          pago("order_4", em("2026-09-21 15:30"), 40),
          pago("order_5", em("2026-09-21 16:00"), 999),
        ],
        daNuvemshop: [
          {
            numero: "3180",
            pagoEm: em("2026-09-23 14:00"),
            feitoEm: em("2026-09-23 14:00"),
            total: 5000,
            itens: [],
          },
          {
            numero: "3100",
            pagoEm: em("2026-09-16 14:00"),
            feitoEm: em("2026-09-16 14:00"),
            total: 2000,
            itens: [],
          },
        ],
      },
      AGORA
    )
    expect(i.vendas).toEqual({ valor: 3, antes: 2, variacao: 50 })
    expect(i.receita).toEqual({ valor: 200, antes: 60, variacao: 233 })
    expect(i.ticket).toEqual({ valor: 66.67, antes: 30, variacao: 122 })
    expect(i.daNuvemshop).toBe(1)
    expect(i.periodo).toMatchObject({
      atalho: "7d",
      comparar: true,
      antesDe: "2026-09-15",
      antesAte: "2026-09-21",
      nomeDoAntes: "15/09 a 21/09",
    })
  })

  it("sem comparar, os de antes são nulos, e as barras não têm o de antes", () => {
    const p = lerPeriodo({ periodo: "ontem", comparar: "nenhum" }, AGORA)
    const i = montarInicioNoPeriodo(
      p,
      { ...semNada, pedidos: [pago("o", em("2026-09-27 09:10"), 10)] },
      AGORA
    )
    expect(i.vendas).toEqual({ valor: 1, antes: null, variacao: null })
    expect(i.barras).toHaveLength(24)
    expect(i.barras[9]).toMatchObject({ nome: "9h", pedidos: 1, receita: 10, antes: null })
  })

  it("hoje hora a hora; o tracejado de ontem é o dia inteiro (o número para na mesma hora)", () => {
    const p = lerPeriodo({}, AGORA)
    const i = montarInicioNoPeriodo(
      p,
      {
        ...semNada,
        pedidos: [
          pago("a", em("2026-09-28 09:30"), 30),
          pago("b", em("2026-09-27 09:45"), 20),
          pago("c", em("2026-09-27 20:00"), 70),
        ],
      },
      AGORA
    )
    expect(i.vendas).toEqual({ valor: 1, antes: 1, variacao: 0 })
    expect(i.barras[9]).toMatchObject({
      pedidos: 1,
      receita: 30,
      antes: { pedidos: 1, receita: 20 },
    })
    expect(i.barras[20]).toMatchObject({ pedidos: 0, antes: { pedidos: 1, receita: 70 } })
    expect(i.barras[15].agora).toBe(true)
  })

  it("os mais vendidos em unidades, juntando a mesma coisa das duas lojas", () => {
    const p = lerPeriodo({ periodo: "30d" }, AGORA)
    const i = montarInicioNoPeriodo(
      p,
      {
        ...semNada,
        pedidos: [
          pago("a", em("2026-09-28 09:30"), 30, [
            { produto: "prod_balm", nome: "Balm para Barba", unidades: 3 },
          ]),
          pago("b", em("2026-09-20 09:30"), 30, [
            { produto: "prod_oleo", nome: "Óleo para Barba — 30ml", unidades: 1 },
          ]),
        ],
        daNuvemshop: [
          {
            numero: "3150",
            pagoEm: em("2026-09-10 10:00"),
            feitoEm: em("2026-09-10 10:00"),
            total: 10000,
            itens: [{ sku: "FB-OLEO", quantidade: 3, valor: 30 }],
          },
        ],
      },
      AGORA
    )
    expect(i.maisVendidos).toEqual([
      { nome: "Óleo", imagem: "https://fotos/oleo.webp", unidades: 4 },
      { nome: "Balm", imagem: null, unidades: 3 },
    ])
  })
})

describe("o checkout passo a passo", () => {
  const carrinho = (c: Partial<CarrinhoDoCheckout> & { id: string }): CarrinhoDoCheckout => ({
    created_at: em("2026-09-28 10:00"),
    items: [{ id: "item" }],
    ...c,
  })
  const contato = {
    email: "a@b.com",
    billing_address: { metadata: { documento: { valor: "12345678909", tipo: "cpf" } } },
  }
  const entrega = {
    ...contato,
    shipping_address: {
      postal_code: "01001000",
      address_1: "Rua A, 1",
      metadata: { rua: "Rua A", numero: "1" },
    },
    shipping_methods: [{ id: "sm" }],
  }

  it("até onde cada carrinho foi", () => {
    const pagos = new Set(["order_pago"])
    expect(ateOndeFoi(carrinho({ id: "0" }), pagos)).toBe(0)
    expect(
      ateOndeFoi(
        carrinho({ id: "1", metadata: { [MARCA_DO_CHECKOUT]: em("2026-09-28 10:01") } }),
        pagos
      )
    ).toBe(1)
    // O de antes da marca conta pelo e-mail.
    expect(ateOndeFoi(carrinho({ id: "1b", email: "x@y.com" }), pagos)).toBe(1)
    expect(ateOndeFoi(carrinho({ id: "2", ...contato }), pagos)).toBe(2)
    expect(ateOndeFoi(carrinho({ id: "2b", ...entrega, shipping_methods: [] }), pagos)).toBe(2)
    expect(ateOndeFoi(carrinho({ id: "3", ...entrega }), pagos)).toBe(3)
    expect(
      ateOndeFoi(
        carrinho({ id: "4", completed_at: em("2026-09-28 10:20"), order: { id: "order_pix" } }),
        pagos
      )
    ).toBe(4)
    expect(
      ateOndeFoi(
        carrinho({ id: "5", completed_at: em("2026-09-28 10:20"), order: { id: "order_pago" } }),
        pagos
      )
    ).toBe(5)
  })

  it("quem chegou em cada passo, a taxa e a maior perda; só os carrinhos com produto, do período", () => {
    const p = lerPeriodo({}, AGORA)
    const marcado = { metadata: { [MARCA_DO_CHECKOUT]: em("2026-09-28 10:01") } }
    const carrinhos = [
      carrinho({ id: "a", ...marcado }),
      carrinho({ id: "b", ...marcado }),
      carrinho({ id: "c", ...marcado, ...contato }),
      carrinho({ id: "d", ...marcado, ...entrega }),
      carrinho({
        id: "e",
        ...entrega,
        completed_at: em("2026-09-28 11:00"),
        order: { id: "order_e" },
      }),
      carrinho({
        id: "f",
        ...entrega,
        completed_at: em("2026-09-28 11:00"),
        order: { id: "order_f" },
      }),
      carrinho({ id: "sem-produto", ...marcado, items: [] }),
      carrinho({ id: "ontem", ...marcado, created_at: em("2026-09-27 10:00") }),
      carrinho({ id: "sacola" }),
    ]
    expect(checkoutDoPeriodo(carrinhos, new Set(["order_f"]), p.atual)).toEqual([
      { nome: "Começaram o checkout", n: 6, taxa: null, pior: false },
      { nome: "Chegaram na entrega", n: 4, taxa: 67, pior: false },
      { nome: "Chegaram no pagamento", n: 3, taxa: 75, pior: false },
      { nome: "Fizeram o pedido", n: 2, taxa: 67, pior: false },
      { nome: "Pagaram", n: 1, taxa: 50, pior: true },
    ])
  })

  it("no Início, o checkout do período e o do de antes, com os pagos da loja nova", () => {
    const p = lerPeriodo({}, AGORA)
    const i = montarInicioNoPeriodo(
      p,
      {
        ...semNada,
        pedidos: [pago("order_hoje", em("2026-09-28 11:05"), 50)],
        carrinhos: [
          carrinho({
            id: "h",
            ...entrega,
            completed_at: em("2026-09-28 11:00"),
            order: { id: "order_hoje" },
          }),
          carrinho({ id: "o", email: "o@o.com", created_at: em("2026-09-27 12:00") }),
          // Ontem, depois da hora de agora: fora do de antes.
          carrinho({ id: "tarde", email: "t@t.com", created_at: em("2026-09-27 19:00") }),
        ],
      },
      AGORA
    )
    expect(i.checkout?.map((x) => x.n)).toEqual([1, 1, 1, 1, 1])
    expect(i.checkoutAntes?.map((x) => x.n)).toEqual([1, 0, 0, 0, 0])
    expect(montarInicioNoPeriodo(p, semNada, AGORA).checkout).toBeNull()
  })
})
