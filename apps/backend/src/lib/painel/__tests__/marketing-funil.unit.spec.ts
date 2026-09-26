import { janelasDo } from "../marketing"
import {
  achadosDoFunil,
  aparelhosDo,
  funilDoCheckout,
  funilDoSite,
  navegadorDoPedido,
  passosDo,
  perguntasDoFunil,
  type CarrinhoDoFunil,
} from "../marketing-funil"
import type { RelatorioGa4 } from "../visitas"

/**
 * O funil do Marketing: as perguntas ao GA4, os passos com a maior perda,
 * da sacola ao pagamento pelos carrinhos, o celular contra o computador e os
 * achados. A hora é de Brasília: 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`)

/** Um relatório de uma dimensão (`[valor, número]`), ou só o número. */
const relatorio = (linhas: [string, number][] | number): RelatorioGa4 => ({
  rows:
    typeof linhas === "number"
      ? [{ metricValues: [{ value: String(linhas) }] }]
      : linhas.map(([d, n]) => ({
          dimensionValues: [{ value: d }],
          metricValues: [{ value: String(n) }],
        })),
})

describe("as perguntas ao GA4", () => {
  it("as sessões, as sessões com cada evento (do endereço da loja), as compras da loja e os aparelhos", () => {
    const [total, eventos, compras, aparelhos] = perguntasDoFunil("30d", ["loja.com"])
    expect(total.dateRanges).toEqual([{ startDate: "29daysAgo", endDate: "today" }])
    expect(eventos.dimensionFilter).toEqual({
      andGroup: {
        expressions: [
          { filter: { fieldName: "hostName", inListFilter: { values: ["loja.com"] } } },
          {
            filter: {
              fieldName: "eventName",
              inListFilter: {
                values: [
                  "view_item",
                  "add_to_cart",
                  "begin_checkout",
                  "add_shipping_info",
                  "add_payment_info",
                ],
              },
            },
          },
        ],
      },
    })
    expect(compras).toMatchObject({
      metrics: [{ name: "ecommercePurchases" }],
      dimensionFilter: { filter: { fieldName: "transactionId" } },
    })
    expect(aparelhos.dimensions).toEqual([{ name: "deviceCategory" }])
    // Sem endereço, o filtro dos eventos fica sozinho.
    expect(perguntasDoFunil("7d", [])[1].dimensionFilter).toMatchObject({
      filter: { fieldName: "eventName" },
    })
  })
})

describe("os passos", () => {
  it("quanto passou de um pro outro, e a maior perda", () => {
    expect(
      passosDo([
        { nome: "a", n: 100 },
        { nome: "b", n: 60 },
        { nome: "c", n: 12 },
        { nome: "d", n: 10 },
      ])
    ).toEqual([
      { nome: "a", n: 100, taxa: null, pior: false },
      { nome: "b", n: 60, taxa: 60, pior: false },
      { nome: "c", n: 12, taxa: 20, pior: true },
      { nome: "d", n: 10, taxa: 83, pior: false },
    ])
  })

  it("do site até o pagamento, pelas respostas do GA4", () => {
    const site = funilDoSite([
      relatorio(1000),
      relatorio([
        ["view_item", 600],
        ["add_to_cart", 120],
        ["begin_checkout", 50],
        ["add_shipping_info", 40],
        ["add_payment_info", 30],
      ]),
      relatorio(10),
    ])
    expect(site.map((p) => [p.nome, p.n])).toEqual([
      ["Entraram no site", 1000],
      ["Viram um produto", 600],
      ["Puseram na sacola", 120],
      ["Começaram o checkout", 50],
      ["Escolheram a entrega", 40],
      ["Foram pagar", 30],
      ["Pagaram", 10],
    ])
    expect(site.findIndex((p) => p.pior)).toBe(2)
  })
})

describe("da sacola ao pagamento, pelos carrinhos", () => {
  const carrinho = (id: string, c: Partial<CarrinhoDoFunil> = {}): CarrinhoDoFunil => ({
    id,
    created_at: em("2026-09-22 10:00"),
    items: [{ id: `${id}-item` }],
    ...c,
  })
  const completo = {
    email: "a@b.com",
    shipping_address: { postal_code: "01001000" },
    shipping_methods: [{ id: "sm" }],
    completed_at: em("2026-09-22 10:20"),
  }

  it("cada passo exige os de antes; só o período, e só carrinho com produto", () => {
    const passos = funilDoCheckout(
      [
        carrinho("pago", { ...completo, order: { id: "order_1" } }),
        carrinho("fechou-sem-pagar", { ...completo, order: { id: "order_2" } }),
        carrinho("viu-o-frete", {
          email: "c@d.com",
          shipping_address: { postal_code: "01001000" },
        }),
        carrinho("deu-o-email", { email: "e@f.com" }),
        carrinho("so-a-sacola"),
        carrinho("vazio", { items: [] }),
        carrinho("antes", { created_at: em("2026-09-01 10:00"), email: "g@h.com" }),
      ],
      new Set(["order_1"]),
      SETE
    )
    expect(passos.map((p) => [p.nome, p.n])).toEqual([
      ["Puseram na sacola", 5],
      ["Deram o e-mail", 4],
      ["Viram o frete", 3],
      ["Escolheram a entrega", 2],
      ["Fecharam o pedido", 2],
      ["Pagaram", 1],
    ])
  })
})

describe("celular e computador", () => {
  const CELULAR =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
  const PC =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"

  it("as visitas pelo GA4 (o tablet é celular) e os pedidos pagos pelo navegador do rastro", () => {
    const aparelhos = aparelhosDo(
      relatorio([
        ["mobile", 700],
        ["tablet", 50],
        ["desktop", 250],
      ]),
      [
        { pagoEm: em("2026-09-23 10:00"), navegador: CELULAR },
        { pagoEm: em("2026-09-23 11:00"), navegador: CELULAR },
        { pagoEm: em("2026-09-24 09:00"), navegador: CELULAR },
        { pagoEm: em("2026-09-22 10:00"), navegador: PC },
        { pagoEm: em("2026-09-21 10:00"), navegador: PC },
        // Sem o sim da faixa, sem navegador: não conta em nenhum.
        { pagoEm: em("2026-09-21 10:00"), navegador: null },
        // Fora do período.
        { pagoEm: em("2026-09-01 10:00"), navegador: PC },
      ],
      SETE
    )
    expect(aparelhos).toEqual([
      { nome: "Celular", visitas: 750, pedidos: 3, parte: 75, conversao: 0.4 },
      { nome: "Computador", visitas: 250, pedidos: 2, parte: 25, conversao: 0.8 },
    ])
    expect(aparelhosDo(relatorio([]), [], SETE)).toBeNull()
  })

  it("o navegador do rastro da compra", () => {
    expect(navegadorDoPedido({ fb_rastro: { navegador: CELULAR } })).toBe(CELULAR)
    expect(navegadorDoPedido({ fb_rastro: { consentimento: "nao" } })).toBeNull()
    expect(navegadorDoPedido(null)).toBeNull()
  })
})

describe("os achados", () => {
  const site = funilDoSite([
    relatorio(1000),
    relatorio([
      ["view_item", 600],
      ["add_to_cart", 120],
      ["begin_checkout", 50],
      ["add_shipping_info", 40],
      ["add_payment_info", 30],
    ]),
    relatorio(10),
  ])

  it("a maior perda, em frase, e o celular vendendo bem menos que o computador", () => {
    const achados = achadosDoFunil(site, [
      { nome: "Celular", visitas: 750, pedidos: 3, parte: 75, conversao: 0.4 },
      { nome: "Computador", visitas: 250, pedidos: 2, parte: 25, conversao: 0.8 },
    ])
    expect(achados.map((a) => a.titulo)).toEqual([
      "8 em cada 10 que veem um produto não põem na sacola",
      "No celular, a conversão é bem menor",
    ])
    expect(achados[0].texto).toMatch(/páginas dos produtos mais vistos/)
    expect(achados[1].texto).toBe(
      "75% das visitas são no celular, mas lá compram 0,40% — no computador, 0,80% compram. " +
        "O checkout no celular é o primeiro lugar pra olhar."
    )
    // Ninguém comprou no celular: a frase diz assim, e não "0,00%".
    const semCompra = achadosDoFunil(site, [
      { nome: "Celular", visitas: 750, pedidos: 0, parte: 75, conversao: 0 },
      { nome: "Computador", visitas: 250, pedidos: 2, parte: 25, conversao: 0.8 },
    ])
    expect(semCompra[1].texto).toMatch(
      /^75% das visitas são no celular, e lá ninguém comprou no período/
    )
  })

  it("com pouca visita, diz que ainda é cedo", () => {
    const pouco = funilDoSite([relatorio(40), relatorio([]), relatorio(0)])
    expect(achadosDoFunil(pouco, null)).toEqual([
      expect.objectContaining({
        tipo: "info",
        titulo: "Ainda é pouco pra achar onde a loja perde gente",
      }),
    ])
  })
})
