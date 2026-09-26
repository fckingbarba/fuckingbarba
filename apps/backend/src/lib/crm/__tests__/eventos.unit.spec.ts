import {
  chaveDoVisitante,
  lerLote,
  lerOrigem,
  MAX_EVENTOS,
  momentoDo,
  origemDoLote,
} from "../eventos"

/**
 * O que a loja manda pro CRM: só o que está na lista, cortado, e sem nada
 * que o navegador não deveria poder dizer (o e-mail, os eventos do servidor).
 */

const VISITANTE = "4f0a8a52-3c7e-4d57-9a44-2f1b8d7e6c10"
const CARRINHO = "cart_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y"
const OLEO = "variant_01K5ZA1B2C3D4E5F6G7H8J9K0M"
const FATOR = "variant_01K5ZA9Z8Y7X6W5V4T3S2R1Q0P"
const LOJA = "loja.fuckingbarba.com.br"

const item = (item_id: string, extra: Record<string, unknown> = {}) => ({
  item_id,
  item_name: "Óleo para barba",
  price: 59.9,
  quantity: 1,
  ...extra,
})

describe("o lote", () => {
  it("sem o visitante com a cara do cookie da loja, não há de quem anotar", () => {
    expect(lerLote({ visitante: "abc", eventos: [] }, LOJA)).toBeNull()
    expect(lerLote({ eventos: [] }, LOJA)).toBeNull()
    expect(lerLote(null, LOJA)).toBeNull()
  })

  it("o carrinho só com a cara de carrinho do Medusa", () => {
    expect(lerLote({ visitante: VISITANTE, carrinho: CARRINHO }, LOJA)?.carrinho).toBe(CARRINHO)
    expect(lerLote({ visitante: VISITANTE, carrinho: "order_01K5" }, LOJA)?.carrinho).toBeNull()
  })

  it("no máximo 20 eventos, e o que não está na lista morre", () => {
    const muitos = Array.from({ length: 30 }, () => ({
      nome: "contato_informado",
      pagina: "/checkout",
    }))
    expect(lerLote({ visitante: VISITANTE, eventos: muitos }, LOJA)?.eventos).toHaveLength(
      MAX_EVENTOS
    )

    const lote = lerLote(
      {
        visitante: VISITANTE,
        eventos: [
          { nome: "view_item_list", pagina: "/barba", dados: { items: [item(OLEO)] } },
          { nome: "select_item", pagina: "/barba" },
          { nome: "consentimento", pagina: "/" },
          { nome: "purchase", pagina: "/obrigado" },
          { nome: "contato_informado", pagina: "https://outro.site/checkout" },
          { nome: "contato_informado", pagina: "/checkout" },
        ],
      },
      LOJA
    )
    expect(lote?.eventos.map((e) => e.tipo)).toEqual(["contato_informado"])
  })
})

describe("cada evento", () => {
  const um = (evento: Record<string, unknown>) =>
    lerLote({ visitante: VISITANTE, eventos: [evento] }, LOJA)?.eventos[0] ?? null

  it("o produto visto: a variante, o nome e o preço — o resto do GA4 fica de fora", () => {
    expect(
      um({
        nome: "view_item",
        pagina: "/produtos/oleo-para-barba?cor=preto",
        dados: {
          currency: "BRL",
          value: 59.9,
          items: [item(OLEO, { item_category: "barba", item_variant: "30 ml" })],
        },
        ha: 1500,
      })
    ).toEqual({
      tipo: "produto_visto",
      pagina: "/produtos/oleo-para-barba",
      dados: {
        itens: [{ variante: OLEO, nome: "Óleo para barba", preco: 59.9, quantidade: 1 }],
        valor: 59.9,
      },
      ha: 1500,
    })
  })

  it("a sacola: só as linhas que valem, a quantidade de 1 a 99, até 10 linhas", () => {
    const e = um({
      nome: "add_to_cart",
      pagina: "/produtos/oleo-para-barba",
      dados: {
        value: 179.7,
        items: [
          item(OLEO, { quantity: 3 }),
          item("prod_01K5ZA1B2C3D4E5F6G7H8J9K0M"),
          item(FATOR, { price: -1 }),
          item(FATOR, { quantity: 500, item_name: "  Fator   de crescimento  " }),
        ],
      },
    })
    expect(e?.tipo).toBe("sacola_entrou")
    expect(e?.dados.itens).toEqual([
      { variante: OLEO, nome: "Óleo para barba", preco: 59.9, quantidade: 3 },
      { variante: FATOR, nome: "Fator de crescimento", preco: 59.9, quantidade: 1 },
    ])
    const onze = Array.from({ length: 11 }, () => item(OLEO))
    expect(
      um({ nome: "remove_from_cart", pagina: "/", dados: { items: onze } })?.dados.itens
    ).toHaveLength(10)
  })

  it("evento de produto sem nenhum produto que valha não fica", () => {
    expect(um({ nome: "view_item", pagina: "/", dados: { items: [] } })).toBeNull()
    expect(um({ nome: "begin_checkout", pagina: "/checkout", dados: { value: 10 } })).toBeNull()
  })

  it("o checkout: a entrega e a forma de pagamento, com o valor", () => {
    expect(
      um({
        nome: "add_shipping_info",
        pagina: "/checkout",
        dados: { value: 119.8, shipping_tier: "PAC", items: [item(OLEO)] },
      })?.dados
    ).toEqual({ frete: "PAC", valor: 119.8 })
    expect(
      um({
        nome: "add_payment_info",
        pagina: "/checkout",
        dados: { value: 119.8, payment_type: "pix" },
      })?.dados
    ).toEqual({ forma: "pix", valor: 119.8 })
    expect(
      um({ nome: "add_payment_info", pagina: "/checkout", dados: { payment_type: "boleto" } })
    ).toBeNull()
    expect(um({ nome: "pix_copiado", pagina: "/checkout", dados: { value: 1e9 } })?.dados).toEqual(
      {}
    )
  })

  it("o 'há quanto tempo' fica entre zero e dez minutos", () => {
    const ha = (v: unknown) => um({ nome: "contato_informado", pagina: "/checkout", ha: v })?.ha
    expect(ha(-50)).toBe(0)
    expect(ha("x")).toBe(0)
    expect(ha(24 * 60 * 60_000)).toBe(10 * 60_000)
    expect(ha(2500.4)).toBe(2500)
    const agora = new Date("2026-09-26T15:00:00Z")
    expect(
      momentoDo(
        { tipo: "contato_informado", pagina: "/", dados: {}, ha: 60_000 },
        agora
      ).toISOString()
    ).toBe("2026-09-26T14:59:00.000Z")
  })
})

describe("a visita e de onde veio", () => {
  it("a campanha do link, minúscula, e só o domínio de quem mandou", () => {
    expect(
      lerOrigem(
        {
          utm_source: "Instagram",
          utm_medium: "bio",
          utm_campaign: "Black Friday",
          utm_content: "<script>",
          de: "https://l.instagram.com/?u=https%3A%2F%2Floja",
        },
        LOJA
      )
    ).toEqual({
      fonte: "instagram",
      meio: "bio",
      campanha: "black friday",
      conteudo: null,
      termo: null,
      de: "l.instagram.com",
    })
  })

  it("a própria loja não é origem; sem nada, a visita fica sem origem", () => {
    expect(lerOrigem({ de: "https://www.loja.fuckingbarba.com.br/barba" }, LOJA)).toBeNull()
    const lote = lerLote(
      { visitante: VISITANTE, eventos: [{ nome: "visita", pagina: "/", dados: {} }] },
      LOJA
    )
    expect(lote?.eventos[0]?.dados).toEqual({})
    expect(lote && origemDoLote(lote)).toBeNull()
  })

  it("a origem do visitante novo é a da primeira visita do lote", () => {
    const lote = lerLote(
      {
        visitante: VISITANTE,
        eventos: [
          { nome: "view_item", pagina: "/produtos/oleo", dados: { items: [item(OLEO)] } },
          { nome: "visita", pagina: "/", dados: { utm_source: "google", utm_medium: "cpc" } },
        ],
      },
      LOJA
    )
    expect(lote && origemDoLote(lote)).toEqual({
      fonte: "google",
      meio: "cpc",
      campanha: null,
      conteudo: null,
      termo: null,
      de: null,
    })
  })
})

describe("quem é a pessoa", () => {
  it("o navegador não diz o e-mail: a identificação só vale do servidor da loja", () => {
    const soDoNavegador = lerLote(
      {
        visitante: VISITANTE,
        eventos: [
          { nome: "newsletter", pagina: "/" },
          { nome: "conta_entrou", pagina: "/conta" },
        ],
      },
      LOJA
    )
    expect(soDoNavegador?.identificacao).toBeNull()
    expect(soDoNavegador?.eventos).toEqual([])

    const doServidor = lerLote(
      {
        visitante: VISITANTE,
        identificacao: { como: "newsletter", email: "  Rafael@Gmail.com " },
        eventos: [{ nome: "newsletter", pagina: "/" }],
      },
      LOJA
    )
    expect(doServidor?.identificacao).toEqual({ como: "newsletter", email: "rafael@gmail.com" })
    expect(doServidor?.eventos.map((e) => e.tipo)).toEqual(["newsletter"])
  })

  it("e-mail que não é e-mail não identifica; a conta vem do token, não do corpo", () => {
    expect(
      lerLote({ visitante: VISITANTE, identificacao: { como: "newsletter", email: "x" } }, LOJA)
        ?.identificacao
    ).toBeNull()
    expect(
      lerLote({ visitante: VISITANTE, identificacao: { como: "conta", email: "a@b.com" } }, LOJA)
        ?.identificacao
    ).toEqual({ como: "conta" })
  })

  it("o banco guarda o visitante embaralhado, igual pra maiúscula e minúscula", () => {
    const chave = chaveDoVisitante(VISITANTE)
    expect(chave).toMatch(/^[0-9a-f]{64}$/)
    expect(chave).not.toContain(VISITANTE.slice(0, 8))
    expect(chaveDoVisitante(VISITANTE.toUpperCase())).toBe(chave)
  })
})
