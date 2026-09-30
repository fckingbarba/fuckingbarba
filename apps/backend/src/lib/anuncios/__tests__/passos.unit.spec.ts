import { lerPassos, lerQuem, MAX_PASSOS, passosPraMeta, passosPraTiktok } from "../passos"

/**
 * Os passos da visita pelo servidor (entrega 0231): o lote que a loja manda,
 * lido com desconfiança, e o formato da Meta e do TikTok.
 */

const agora = Date.parse("2026-09-30T20:00:00Z")
const agoraS = agora / 1000

const sacola = {
  nome: "AddToCart",
  id: "a1b2c3d4-e5f6",
  pagina: "https://www.fuckingbarba.com.br/produtos/oleo-para-barba?utm_source=ig&q=x",
  em: agoraS - 5,
  para: ["meta", "tiktok"],
  valor: 79.9,
  itens: [{ id: "variant_01", nome: "Óleo para Barba", quantidade: 1, preco: 79.9 }],
}

const visita = {
  nome: "PageView",
  id: "pv-0000-1111",
  pagina: "https://www.fuckingbarba.com.br/",
  em: agoraS,
  para: ["meta"],
}

const quem = lerQuem({
  ip: "200.100.50.25",
  navegador: "Mozilla/5.0 (Windows)",
  fbp: "fb.1.1790348181000.123456789",
  fbc: "fb.1.1790348181000.IwAR3xyz_abc",
  ttp: "01J9ABCDEFttp.tt.1",
  ttclid: "E.C.P.ttclid_de_teste",
})

describe("o lote da loja", () => {
  it("o passo que vale passa, com a página sem a busca", () => {
    const [p] = lerPassos([sacola], "fuckingbarba.com.br", agora)
    expect(p).toEqual({
      nome: "AddToCart",
      id: "a1b2c3d4-e5f6",
      pagina: "https://www.fuckingbarba.com.br/produtos/oleo-para-barba",
      em: agoraS - 5,
      para: ["meta", "tiktok"],
      valor: 79.9,
      itens: [{ id: "variant_01", nome: "Óleo para Barba", quantidade: 1, preco: 79.9 }],
    })
  })

  it("a visita à página vai sem valor nem itens", () => {
    const [p] = lerPassos([{ ...visita, valor: 10, itens: sacola.itens }], null, agora)
    expect(p).toMatchObject({ nome: "PageView", valor: null, itens: [] })
  })

  it("o que não tem a cara do passo sai: nome, id, página de outro site, destino, repetido", () => {
    const lidos = lerPassos(
      [
        { ...sacola, nome: "Purchase" },
        { ...sacola, id: "curto" },
        { ...sacola, id: "x".repeat(65) },
        { ...sacola, pagina: "https://golpe.com/produtos/oleo" },
        { ...sacola, pagina: "javascript:alert(1)" },
        { ...sacola, para: ["ga4"] },
        sacola,
        sacola,
      ],
      "fuckingbarba.com.br",
      agora
    )
    expect(lidos.map((p) => p.id)).toEqual([sacola.id])
    expect(lerPassos("sacola", null, agora)).toEqual([])
  })

  it("o horário: o do futuro vira agora, o de mais de uma hora vira uma hora atrás", () => {
    const [futuro] = lerPassos([{ ...sacola, em: agoraS + 30 }], null, agora)
    const [velho] = lerPassos([{ ...sacola, em: agoraS - 86_400 }], null, agora)
    const [sem] = lerPassos([{ ...sacola, em: "ontem" }], null, agora)
    expect(futuro.em).toBe(agoraS)
    expect(velho.em).toBe(agoraS - 3600)
    expect(sem.em).toBe(agoraS)
  })

  it("item torto sai; valor fora da conta vira nulo; nunca mais de 20 passos", () => {
    const [p] = lerPassos(
      [
        {
          ...sacola,
          valor: -1,
          itens: [
            { id: "variant_01", nome: "Ok", quantidade: 2, preco: 10 },
            { id: "<script>", nome: "X", quantidade: 1, preco: 1 },
            { id: "variant_02", nome: "Meio", quantidade: 1.5, preco: 1 },
            { id: "variant_03", nome: "Caro", quantidade: 1, preco: 1e9 },
          ],
        },
      ],
      null,
      agora
    )
    expect(p.valor).toBeNull()
    expect(p.itens.map((i) => i.id)).toEqual(["variant_01"])
    const muitos = Array.from({ length: 30 }, (_, n) => ({ ...sacola, id: `passo-${1000 + n}` }))
    expect(lerPassos(muitos, null, agora)).toHaveLength(MAX_PASSOS)
  })

  it("quem visitou: o cookie torto vira nulo", () => {
    expect(lerQuem({ fbp: "fb.1.x; drop", ttp: "com espaço", ip: "<script>" })).toEqual({
      ip: null,
      navegador: null,
      fbp: null,
      fbc: null,
      ttp: null,
      ttclid: null,
    })
  })
})

describe("o formato de cada plataforma", () => {
  const passos = lerPassos(
    [visita, sacola, { ...sacola, nome: "InitiateCheckout", id: "ic-2222-3333" }],
    null,
    agora
  )

  it("Meta: o mesmo event_id do pixel, os cookies, o IP e o navegador", () => {
    const corpo = passosPraMeta(passos, quem, null)!
    expect(corpo).not.toHaveProperty("test_event_code")
    const [pv, add, ic] = corpo.data as Record<string, unknown>[]
    expect(pv).toEqual({
      event_name: "PageView",
      event_time: agoraS,
      event_id: "pv-0000-1111",
      action_source: "website",
      event_source_url: "https://www.fuckingbarba.com.br/",
      user_data: {
        fbp: "fb.1.1790348181000.123456789",
        fbc: "fb.1.1790348181000.IwAR3xyz_abc",
        client_ip_address: "200.100.50.25",
        client_user_agent: "Mozilla/5.0 (Windows)",
      },
    })
    expect(add).toMatchObject({
      event_name: "AddToCart",
      event_id: "a1b2c3d4-e5f6",
      custom_data: {
        currency: "BRL",
        value: 79.9,
        content_type: "product",
        content_ids: ["variant_01"],
        contents: [{ id: "variant_01", quantity: 1, item_price: 79.9 }],
      },
    })
    expect((add.custom_data as object) ?? {}).not.toHaveProperty("num_items")
    expect(ic).toMatchObject({ event_name: "InitiateCheckout", custom_data: { num_items: 1 } })
    expect(passosPraMeta(passos, quem, "TEST123")).toMatchObject({ test_event_code: "TEST123" })
  })

  it("TikTok: só os passos pra ele, a visita como Pageview, o ttclid e o ttp", () => {
    const corpo = passosPraTiktok(passos, quem, "C4ABCDEFGH1234567890", null)!
    expect(corpo).toMatchObject({ event_source: "web", event_source_id: "C4ABCDEFGH1234567890" })
    const dados = corpo.data as Record<string, unknown>[]
    // A visita era só pra Meta.
    expect(dados.map((d) => d.event)).toEqual(["AddToCart", "InitiateCheckout"])
    expect(dados[0]).toMatchObject({
      event_id: "a1b2c3d4-e5f6",
      user: {
        ttp: "01J9ABCDEFttp.tt.1",
        ttclid: "E.C.P.ttclid_de_teste",
        ip: "200.100.50.25",
        user_agent: "Mozilla/5.0 (Windows)",
      },
      page: { url: "https://www.fuckingbarba.com.br/produtos/oleo-para-barba" },
      properties: {
        currency: "BRL",
        value: 79.9,
        contents: [
          { content_id: "variant_01", content_name: "Óleo para Barba", quantity: 1, price: 79.9 },
        ],
      },
    })
    const soVisita = lerPassos([{ ...visita, para: ["tiktok"] }], null, agora)
    expect(
      (passosPraTiktok(soVisita, quem, "C4X", null)!.data as { event: string }[])[0].event
    ).toBe("Pageview")
  })

  it("sem passo pra plataforma, nada vai pra ela", () => {
    const soMeta = lerPassos([visita], null, agora)
    expect(passosPraTiktok(soMeta, quem, "C4X", null)).toBeNull()
    expect(passosPraMeta([], quem, null)).toBeNull()
  })
})
