import { cotar, itensPraCotar, somaDosProdutos, type LinhaDoCarrinho } from "../client"

/**
 * A PERGUNTA DO CARRINHO — o valor e os itens que vão à Frenet.
 *
 * O provider (quando o Medusa cota) e a rota `/store/frete` (com o carrinho
 * da sacola, ou com as linhas que o carrinho teria, na PDP) montam a pergunta
 * com estas duas funções, e é por serem as MESMAS que a da sacola e a do
 * frete pendurado caem na mesma viagem. O achado de 23/09 foi a rota somando
 * o preço cheio e o Medusa, o da faixa de quantidade: duas perguntas, duas
 * viagens.
 */

const CAIXA = { weight: 250, length: 20, width: 15, height: 8 }

describe("o valor dos produtos", () => {
  it("é o preço da linha vezes a quantidade — e o preço já vem com a faixa", () => {
    // 2 frascos de R$ 49,90 saem R$ 47,45 cada na faixa de 2
    expect(somaDosProdutos([{ unit_price: 47.45, quantity: 2, variant: CAIXA }])).toBe(94.9)
  })

  it("fecha no centavo: 3 x R$ 46,30 é R$ 138,90, e não 138,89999999999998", () => {
    expect(46.3 * 3).not.toBe(138.9)
    expect(somaDosProdutos([{ unit_price: 46.3, quantity: 3 }])).toBe(138.9)
    expect(
      somaDosProdutos([
        { unit_price: 46.3, quantity: 3 },
        { unit_price: 54.9, quantity: 1 },
      ])
    ).toBe(193.8)
  })

  it("lê número em texto e trata o que não é número como zero", () => {
    expect(
      somaDosProdutos([
        { unit_price: "49.9", quantity: "1" },
        { unit_price: null, quantity: 2 },
        { unit_price: 10, quantity: undefined },
        { unit_price: "abc", quantity: 1 },
      ])
    ).toBe(49.9)
    expect(somaDosProdutos([])).toBe(0)
  })
})

describe("os itens da cotação", () => {
  it("peso e medida da VARIANTE, e a quantidade da linha", () => {
    expect(itensPraCotar([{ unit_price: 47.45, quantity: 2, variant: CAIXA }])).toEqual([
      { pesoEmGramas: 250, comprimento: 20, largura: 15, altura: 8, quantidade: 2 },
    ])
  })

  it("variante sem medida vira zero, e linha sem quantidade vale uma", () => {
    expect(itensPraCotar([{ unit_price: 10, variant: null }])).toEqual([
      { pesoEmGramas: 0, comprimento: 0, largura: 0, altura: 0, quantidade: 1 },
    ])
  })
})

describe("a mesma pergunta, uma viagem só", () => {
  const original = global.fetch
  const fetchFalso = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ShippingSevicesArray: [
        {
          ServiceCode: "04510",
          Carrier: "Correios",
          ServiceDescription: "PAC",
          ShippingPrice: "23.70",
          DeliveryTime: "8",
        },
      ],
    }),
  }))

  beforeEach(() => {
    fetchFalso.mockClear()
    global.fetch = fetchFalso as unknown as typeof fetch
  })
  afterAll(() => {
    global.fetch = original
  })

  const perguntar = (
    carrinho: string,
    linhas: LinhaDoCarrinho[],
    valor = somaDosProdutos(linhas)
  ) =>
    cotar({
      token: "teste",
      cepDeOrigem: "01310100",
      cepDeDestino: "90010150",
      valor,
      itens: itensPraCotar(linhas),
      carrinho,
    })

  /* A mesma linha pelos dois caminhos: no contexto do provider ela vem
     inteira (id, título, a variante com tudo); no `query.graph` da rota, só
     com o que foi pedido. O que não entra na pergunta não muda a pergunta. */
  const varianteInteira = { id: "variant_1", material: "vidro", ...CAIXA }
  const linhaInteira = { id: "cali_1", title: "Shampoo", unit_price: 47.45, quantity: 2 }
  const doContexto: LinhaDoCarrinho[] = [{ ...linhaInteira, variant: varianteInteira }]
  const daRota: LinhaDoCarrinho[] = [{ unit_price: 47.45, quantity: 2, variant: CAIXA }]

  it("o provider e a rota, pelo mesmo carrinho, dividem a ida à Frenet", async () => {
    await Promise.all([perguntar("cart_UM", doContexto), perguntar("cart_UM", daRota)])
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it("com o preço cheio no lugar do da faixa, eram duas perguntas e duas idas", async () => {
    await Promise.all([
      perguntar("cart_DOIS", doContexto),
      perguntar("cart_DOIS", daRota, 2 * 49.9), // a rota somava o preço da região
    ])
    expect(fetchFalso).toHaveBeenCalledTimes(2)
  })

  it("carrinhos diferentes não se misturam", async () => {
    await Promise.all([perguntar("cart_TRES", daRota), perguntar("cart_QUATRO", daRota)])
    expect(fetchFalso).toHaveBeenCalledTimes(2)
  })
})
