import {
  ateOndeFoi,
  checkoutDoPeriodo,
  MARCA_DO_CARTAO_NA_TELA,
  MARCA_DO_CHECKOUT,
  montarInicioNoPeriodo,
  saidasDoPagamento,
  saidosNoPagamento,
  vendasDaNuvemshop,
  type CarrinhoDoCheckout,
  type DadosDoPeriodo,
  type ProdutoComSku,
  type TentativaDoCarrinho,
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
  tentativas: null,
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
    // Sem as tentativas (a leitura falhou), o checkout vem sem o porquê.
    expect(i.saidas).toBeNull()
    expect(montarInicioNoPeriodo(p, semNada, AGORA).checkout).toBeNull()
    expect(montarInicioNoPeriodo(p, semNada, AGORA).saidas).toBeNull()
  })

  describe("por que saíram no pagamento (0244)", () => {
    const tentativa = (
      carrinho: string,
      quando: string,
      resultado: string,
      motivo: string | null = null
    ): TentativaDoCarrinho => ({ carrinho, resultado, motivo, created_at: em(quando) })
    const naTela = (quando: string, porque = "dados") => ({
      metadata: { [MARCA_DO_CARTAO_NA_TELA]: { porque, em: em(quando) } },
    })
    const parou = (id: string, extra: Partial<CarrinhoDoCheckout> = {}) =>
      carrinho({ id, ...entrega, ...extra })

    it("só os que chegaram no pagamento e não viraram pedido, do período e com produto", () => {
      const p = lerPeriodo({}, AGORA)
      const carrinhos = [
        parou("p"),
        carrinho({ id: "entrega", ...contato }),
        carrinho({ id: "pedido", ...entrega, completed_at: em("2026-09-28 11:00") }),
        parou("ontem", { created_at: em("2026-09-27 10:00") }),
        parou("sem-produto", { items: [] }),
      ]
      expect(saidosNoPagamento(carrinhos, p.atual).map((c) => c.id)).toEqual(["p"])
    })

    it("cada um pelo que aconteceu por último: a recusa, a trava, o erro, a tela ou nada", () => {
      const p = lerPeriodo({}, AGORA)
      const carrinhos = [
        parou("banco"),
        parou("antifraude"),
        parou("dados"),
        parou("barrada"),
        parou("pix-fora"),
        parou("estoque"),
        parou("andando"),
        parou("tela", naTela("2026-09-28 10:30")),
        parou("nada"),
        // Recusado no banco e, depois, o outro cartão travou na tela: a tela.
        parou("recusa-e-tela", naTela("2026-09-28 10:40")),
        // O cartão travou na tela e, depois, o banco recusou o outro: o banco.
        parou("tela-e-recusa", naTela("2026-09-28 10:20")),
        // A tela sem a hora (marca torta): conta da criação do carrinho — a tentativa é mais nova.
        parou("tela-sem-hora", { metadata: { [MARCA_DO_CARTAO_NA_TELA]: { porque: "dados" } } }),
        // Só a marca, sem a hora: a tela.
        parou("so-tela-sem-hora", { metadata: { [MARCA_DO_CARTAO_NA_TELA]: "dados" } }),
        // Recusado e, depois, o Pix que não nasceu: o erro (o último).
        parou("recusa-e-erro"),
      ]
      const tentativas = [
        tentativa("banco", "2026-09-28 10:10", "recusada", "banco"),
        tentativa("antifraude", "2026-09-28 10:10", "recusada", "antifraude"),
        tentativa("dados", "2026-09-28 10:10", "recusada", "dados"),
        tentativa("barrada", "2026-09-28 10:10", "barrada", "carrinho"),
        tentativa("pix-fora", "2026-09-28 10:10", "erro", "fora"),
        tentativa("estoque", "2026-09-28 10:10", "parou"),
        tentativa("andando", "2026-09-28 10:10", "andando"),
        tentativa("recusa-e-tela", "2026-09-28 10:30", "recusada", "banco"),
        tentativa("tela-e-recusa", "2026-09-28 10:30", "recusada", "banco"),
        tentativa("tela-sem-hora", "2026-09-28 10:30", "recusada", "antifraude"),
        tentativa("recusa-e-erro", "2026-09-28 10:30", "erro", "incerto"),
        tentativa("recusa-e-erro", "2026-09-28 10:10", "recusada", "banco"),
        // A marca de soltura (o carrinho é "-") não é de ninguém; a de outro carrinho, também não.
        tentativa("-", "2026-09-28 10:50", "solta"),
        tentativa("nada", "2026-09-28 10:50", "solta"),
        tentativa("outro", "2026-09-28 10:10", "recusada", "banco"),
      ]
      expect(saidasDoPagamento(carrinhos, tentativas, p.atual, AGORA)).toEqual({
        total: 14,
        recusado: { banco: 2, antifraude: 2, dados: 1 },
        naTela: 3,
        barrado: 1,
        erro: 4,
        semTentar: 1,
        semRegistro: 0,
      })
    })

    it("o carrinho de antes do registro, ou de mais de 30 dias, fica sem registro", () => {
      const sete = lerPeriodo({ periodo: "7d" }, AGORA)
      // 26/09: antes de o Pix ser anotado (a 0150 subiu em 27/09, 14:14 UTC).
      const antes = [parou("26", { created_at: em("2026-09-26 15:00") }), parou("28")]
      expect(saidasDoPagamento(antes, [], sete.atual, AGORA)).toMatchObject({
        total: 2,
        semRegistro: 1,
        semTentar: 1,
      })
      // Em novembro, o vigia já apagou as tentativas de mais de 30 dias.
      const depois = new Date("2026-11-10T15:00:00.000Z")
      const noventa = lerPeriodo({ periodo: "90d" }, depois)
      const velhos = [
        parou("outubro", {
          created_at: em("2026-10-05 10:00"),
          ...naTela("2026-10-05 10:05"),
        }),
        parou("novembro", { created_at: em("2026-11-01 10:00") }),
      ]
      const tentativas = [tentativa("novembro", "2026-11-01 10:05", "recusada", "dados")]
      expect(saidasDoPagamento(velhos, tentativas, noventa.atual, depois)).toEqual({
        total: 2,
        recusado: { banco: 0, antifraude: 0, dados: 1 },
        naTela: 0,
        barrado: 0,
        erro: 0,
        semTentar: 0,
        semRegistro: 1,
      })
    })

    it("no Início, o porquê junto com o checkout; o total é o 'saíram' do 'Fizeram o pedido'", () => {
      const p = lerPeriodo({}, AGORA)
      const i = montarInicioNoPeriodo(
        p,
        {
          ...semNada,
          carrinhos: [
            parou("a"),
            parou("b", naTela("2026-09-28 10:30", "conexao")),
            carrinho({ id: "c", ...entrega, completed_at: em("2026-09-28 11:00") }),
          ],
          tentativas: [tentativa("a", "2026-09-28 10:10", "recusada", "banco")],
        },
        AGORA
      )
      const [, , noPagamento, fizeram] = i.checkout!.map((x) => x.n)
      expect(i.saidas).toMatchObject({ total: 2, recusado: { banco: 1 }, naTela: 1 })
      expect(i.saidas!.total).toBe(noPagamento - fizeram)
    })
  })
})
