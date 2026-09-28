import {
  aceitaAvaliacao,
  chegouEm,
  decidirPedido,
  dentroDoHorario,
  JANELA_EM_DIAS,
  lerAvaliacao,
  lerAvaliacaoDireta,
  lerRegistroDoPedido,
  LIMITES,
  limparNome,
  limparTexto,
  nomeSugerido,
  numeroDoPedido,
  produtosDoPedido,
  produtosQueOPedidoAvalia,
  type EnvioDaRodada,
  type PedidoDaRodada,
  type ProdutoDoCatalogo,
} from "../regras"

const PRODUTO = "prod_01M3EJPC2SBR23EKZVK6HVGCP3"
const AGORA = new Date("2026-09-27T15:00:00Z") // 12h em Brasília
const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const atras = (ms: number) => new Date(AGORA.getTime() - ms)

describe("o que a página manda", () => {
  it("o nome sai sem espaço sobrando; sem letra ou fora do tamanho, não vale", () => {
    expect(limparNome("  Rafael   S. ")).toBe("Rafael S.")
    expect(limparNome("R")).toBeNull()
    expect(limparNome("...")).toBeNull()
    expect(limparNome("12345")).toBeNull()
    expect(limparNome("a".repeat(LIMITES.nome.max + 1))).toBeNull()
    expect(limparNome(42)).toBeNull()
  })

  it("o texto vai como a pessoa escreveu — só sai o que ninguém vê", () => {
    expect(limparTexto("  Muito bom!\r\n\r\n\r\n\r\nRecomendo  ")).toBe("Muito bom!\n\nRecomendo")
    expect(limparTexto("tá top, mais o pote é pequeno")).toBe("tá top, mais o pote é pequeno")
    expect(limparTexto("Muito bom\u0007")).toBe("Muito bom")
    expect(limparTexto("  ")).toBeNull()
    expect(limparTexto("x".repeat(LIMITES.texto.max + 1))).toBeNull()
  })

  it("confere campo a campo e diz o primeiro que não serve", () => {
    const certo = { produto: PRODUTO, nota: 4, nome: "Rafael S.", texto: "Segurou o dia todo." }
    expect(lerAvaliacao(certo)).toEqual({
      ok: true,
      avaliacao: { produtoId: PRODUTO, nome: "Rafael S.", nota: 4, texto: "Segurou o dia todo." },
    })
    expect(lerAvaliacao({ ...certo, nota: "5" })).toMatchObject({ ok: true })
    expect(lerAvaliacao({ ...certo, produto: "prod_x" })).toEqual({ ok: false, campo: "produto" })
    expect(lerAvaliacao({ ...certo, nota: 0 })).toEqual({ ok: false, campo: "nota" })
    expect(lerAvaliacao({ ...certo, nota: 4.5 })).toEqual({ ok: false, campo: "nota" })
    expect(lerAvaliacao({ ...certo, nome: "" })).toEqual({ ok: false, campo: "nome" })
    expect(lerAvaliacao({ ...certo, texto: "" })).toEqual({ ok: false, campo: "texto" })
    expect(lerAvaliacao(null)).toEqual({ ok: false, campo: "produto" })
  })

  it("o número do pedido do jeito que a pessoa digita", () => {
    expect(numeroDoPedido("#1.234")).toBe(1234)
    expect(numeroDoPedido(" FB-591 ")).toBe(591)
    expect(numeroDoPedido(77)).toBe(77)
    expect(numeroDoPedido("abc")).toBeNull()
    expect(numeroDoPedido("0")).toBeNull()
    expect(numeroDoPedido("1234567890")).toBeNull()
  })
})

describe("o nome sugerido", () => {
  it("o primeiro nome e a inicial do último sobrenome", () => {
    expect(nomeSugerido("rafael", "de souza")).toBe("Rafael S.")
    expect(nomeSugerido("Ana Paula", "Oliveira")).toBe("Ana O.")
    expect(nomeSugerido("João", "")).toBe("João")
    expect(nomeSugerido("", "Souza")).toBe("")
    expect(nomeSugerido(null, null)).toBe("")
    expect(nomeSugerido("élton", "ávila")).toBe("Élton Á.")
  })
})

describe("o pedido: os produtos e se aceita avaliação", () => {
  it("um produto de cada, na ordem dos itens, sem o item de produto apagado", () => {
    const produtos = produtosDoPedido([
      { product_id: "prod_A", product_title: "Óleo", product_handle: "oleo", thumbnail: "a.webp" },
      { product_id: "prod_B", title: "Balm" },
      { product_id: "prod_A", product_title: "Óleo" },
      { product_id: null, product_title: "Apagado" },
      null,
    ])
    expect(produtos).toEqual([
      { id: "prod_A", nome: "Óleo", handle: "oleo", imagem: "a.webp" },
      { id: "prod_B", nome: "Balm", handle: null, imagem: null },
    ])
  })

  it("pago e não cancelado — a entrega não entra na conta", () => {
    expect(aceitaAvaliacao({ status: "pending", pago: true })).toBe(true)
    expect(aceitaAvaliacao({ status: "completed", pago: true })).toBe(true)
    expect(aceitaAvaliacao({ status: "canceled", pago: true })).toBe(false)
    expect(aceitaAvaliacao({ status: "pending", pago: false })).toBe(false)
  })
})

describe("a página sem o link: o número, o e-mail e a avaliação num envio só", () => {
  const certo = {
    numero: "#3.301",
    email: "  Rafael@Exemplo.COM ",
    produto: PRODUTO,
    nota: 5,
    nome: "Rafael S.",
    texto: "Segurou o dia todo.",
  }

  it("o número do jeito que a pessoa digita, e o e-mail como a loja guarda", () => {
    expect(lerAvaliacaoDireta(certo)).toEqual({
      ok: true,
      avaliacao: {
        numero: 3301,
        email: "rafael@exemplo.com",
        produtoId: PRODUTO,
        nome: "Rafael S.",
        nota: 5,
        texto: "Segurou o dia todo.",
      },
    })
  })

  it("diz o primeiro campo que não serve — o número e o e-mail antes da avaliação", () => {
    expect(lerAvaliacaoDireta({ ...certo, numero: "" })).toEqual({ ok: false, campo: "numero" })
    expect(lerAvaliacaoDireta({ ...certo, numero: "abc" })).toEqual({ ok: false, campo: "numero" })
    expect(lerAvaliacaoDireta({ ...certo, email: "rafael" })).toEqual({ ok: false, campo: "email" })
    expect(lerAvaliacaoDireta({ ...certo, email: "=cmd@x.com" })).toEqual({
      ok: false,
      campo: "email",
    })
    expect(lerAvaliacaoDireta({ ...certo, produto: "" })).toEqual({ ok: false, campo: "produto" })
    expect(lerAvaliacaoDireta({ ...certo, nota: 6 })).toEqual({ ok: false, campo: "nota" })
    expect(lerAvaliacaoDireta({ ...certo, nome: "1" })).toEqual({ ok: false, campo: "nome" })
    expect(lerAvaliacaoDireta({ ...certo, texto: " " })).toEqual({ ok: false, campo: "texto" })
    expect(lerAvaliacaoDireta(undefined)).toEqual({ ok: false, campo: "numero" })
  })
})

describe("os produtos que o pedido deixa avaliar", () => {
  const CATALOGO: ProdutoDoCatalogo[] = [
    { id: "prod_FATOR", nome: "Fator de Crescimento", skus: ["FBFCB01"] },
    { id: "prod_OLEO", nome: "Óleo para Barba", skus: ["FBOL01"] },
    { id: "prod_BALM", nome: "Balm para Barba", skus: ["FBBM01"] },
    { id: "prod_SHAMPOO", nome: "Shampoo para Barba", skus: ["fbsh01"] },
    { id: "prod_COMPLETO", nome: "Kit Completo", skus: ["FBKIT01"] },
    { id: "prod_FATOR_SHAMPOO", nome: "Kit Fator + Shampoo", skus: ["FBKIT08"] },
    { id: "prod_MATTE", nome: "Pasta Matte", skus: ["FBPMT01"] },
    { id: "prod_BRILHO", nome: "Pasta Brilho", skus: ["FBPBR01"] },
  ]
  const ids = (m: Map<string, string>) => [...m.keys()].sort()

  it("o pedido da Nuvemshop: o produto de hoje pelo SKU (maiúscula ou não)", () => {
    const m = produtosQueOPedidoAvalia([{ sku: " fbol01 ", nome: "Óleo 30ml" }], CATALOGO)
    expect([...m]).toEqual([["prod_OLEO", "Óleo para Barba"]])
    expect(ids(produtosQueOPedidoAvalia([{ sku: "FBSH01" }], CATALOGO))).toEqual(["prod_SHAMPOO"])
  })

  it("o kit abre o kit e cada avulso do que vem nele", () => {
    expect(ids(produtosQueOPedidoAvalia([{ sku: "FBKIT01" }], CATALOGO))).toEqual([
      "prod_BALM",
      "prod_COMPLETO",
      "prod_OLEO",
      "prod_SHAMPOO",
    ])
    expect(ids(produtosQueOPedidoAvalia([{ sku: "FBKIT08" }], CATALOGO))).toEqual([
      "prod_FATOR",
      "prod_FATOR_SHAMPOO",
      "prod_SHAMPOO",
    ])
  })

  it("o kit de quantidade que saiu da loja ainda abre o avulso (3 Fatores → o Fator)", () => {
    expect([...produtosQueOPedidoAvalia([{ sku: "FBKIT06" }], CATALOGO)]).toEqual([
      ["prod_FATOR", "Fator de Crescimento"],
    ])
  })

  it("produto de uma unidade só não abre outro do mesmo tipo (uma pasta não vale pela outra)", () => {
    expect(ids(produtosQueOPedidoAvalia([{ sku: "FBPBR01" }], CATALOGO))).toEqual(["prod_BRILHO"])
  })

  it("o pedido da loja nova: o produto pelo id, com o nome do catálogo — ou o do item, se saiu", () => {
    const m = produtosQueOPedidoAvalia(
      [
        {
          produtoId: "prod_OLEO",
          nome: "Óleo (nome velho)",
          sku: "FBOL01",
          handle: "oleo-para-barba",
        },
        { produtoId: "prod_RASCUNHO", nome: " Kit 2 Fatores ", sku: "FBKIT05" },
      ],
      CATALOGO
    )
    expect([...m]).toEqual([
      ["prod_OLEO", "Óleo para Barba"],
      ["prod_RASCUNHO", "Kit 2 Fatores"],
      ["prod_FATOR", "Fator de Crescimento"],
    ])
  })

  it("o kit da loja nova sem SKU na tabela abre pelo endereço", () => {
    const m = produtosQueOPedidoAvalia(
      [{ produtoId: "prod_KIT", nome: "Kit", handle: "kit-fator-de-crescimento-e-shampoo" }],
      CATALOGO
    )
    expect(ids(m)).toEqual(["prod_FATOR", "prod_KIT", "prod_SHAMPOO"])
  })

  it("SKU que a loja não tem mais não abre nada", () => {
    expect(produtosQueOPedidoAvalia([{ sku: "FBXX99" }, { sku: null }], CATALOGO).size).toBe(0)
  })
})

describe("o e-mail que pede", () => {
  it("só das 9h às 20h59 de Brasília", () => {
    expect(dentroDoHorario(new Date("2026-09-27T12:00:00Z"))).toBe(true) // 9h
    expect(dentroDoHorario(new Date("2026-09-27T11:59:00Z"))).toBe(false) // 8h59
    expect(dentroDoHorario(new Date("2026-09-27T23:59:00Z"))).toBe(true) // 20h59
    expect(dentroDoHorario(new Date("2026-09-28T00:00:00Z"))).toBe(false) // 21h
  })

  it("chegou quando o último pacote chegou, e só se nenhum está na rua", () => {
    const entregue = (dias: number, codigo = "QS1BR"): EnvioDaRodada => ({
      pedido_id: "o1",
      situacao: "entregue",
      codigo,
      entregue_em: atras(dias * DIA),
    })
    expect(chegouEm([entregue(3), entregue(2)])).toEqual(atras(2 * DIA))
    expect(
      chegouEm([
        entregue(2),
        { pedido_id: "o1", situacao: "em_transito", codigo: "X", entregue_em: null },
      ])
    ).toBeNull()
    // Registro no parceiro sem etiqueta ainda não é pacote.
    expect(
      chegouEm([
        entregue(2),
        { pedido_id: "o1", situacao: "aguardando", codigo: null, entregue_em: null },
      ])
    ).toEqual(atras(2 * DIA))
    expect(
      chegouEm([
        entregue(2),
        { pedido_id: "o1", situacao: "aguardando", codigo: "Y", entregue_em: null },
      ])
    ).toBeNull()
    expect(
      chegouEm([{ pedido_id: "o1", situacao: "devolvido", codigo: "Z", entregue_em: null }])
    ).toBeNull()
    expect(chegouEm([])).toBeNull()
  })

  const pedido = (extra: Partial<PedidoDaRodada> = {}): PedidoDaRodada => ({
    id: "order_1",
    status: "pending",
    email: "rafael@exemplo.com",
    metadata: {},
    pago: true,
    semAvaliacao: 2,
    ...extra,
  })

  it("manda um dia depois da entrega, até o fim da janela", () => {
    expect(decidirPedido(pedido(), atras(DIA + HORA), AGORA)).toEqual({ mandar: true })
    expect(decidirPedido(pedido(), atras(DIA - HORA), AGORA)).toEqual({
      mandar: false,
      motivo: "esperando",
    })
    expect(decidirPedido(pedido(), null, AGORA)).toEqual({ mandar: false, motivo: "esperando" })
    expect(decidirPedido(pedido(), atras((JANELA_EM_DIAS + 1) * DIA), AGORA)).toEqual({
      mandar: false,
      motivo: "fora-da-janela",
    })
  })

  it("uma vez só: o registro no pedido segura a segunda", () => {
    const registrado = pedido({
      metadata: { emails: { avaliacao: { em: AGORA.toISOString(), como: "email" } } },
    })
    expect(decidirPedido(registrado, atras(2 * DIA), AGORA)).toEqual({
      mandar: false,
      motivo: "ja-registrado",
    })
  })

  it("o que não muda mais fica registrado como dispensado", () => {
    const chegou = atras(2 * DIA)
    expect(decidirPedido(pedido({ status: "canceled" }), chegou, AGORA)).toMatchObject({
      motivo: "cancelado",
      registrar: true,
    })
    expect(decidirPedido(pedido({ pago: false }), chegou, AGORA)).toMatchObject({
      motivo: "nao-pago",
      registrar: true,
    })
    expect(decidirPedido(pedido({ email: "" }), chegou, AGORA)).toMatchObject({
      motivo: "sem-email",
      registrar: true,
    })
    expect(decidirPedido(pedido({ semAvaliacao: 0 }), chegou, AGORA)).toMatchObject({
      motivo: "ja-avaliou",
      registrar: true,
    })
  })

  it("lê o registro do pedido, e ignora o torto", () => {
    expect(lerRegistroDoPedido({ emails: { avaliacao: { em: "x", como: "email" } } })).toEqual({
      em: "x",
      como: "email",
    })
    expect(lerRegistroDoPedido({ emails: { avaliacao: { em: "x", como: "outro" } } })).toBeNull()
    expect(lerRegistroDoPedido({ emails: { confirmado: { em: "x", como: "email" } } })).toBeNull()
    expect(lerRegistroDoPedido(null)).toBeNull()
  })
})
