import {
  aceitaAvaliacao,
  chegouEm,
  decidirPedido,
  dentroDoHorario,
  JANELA_EM_DIAS,
  lerAvaliacao,
  lerRegistroDoPedido,
  LIMITES,
  limparNome,
  limparTexto,
  nomeSugerido,
  numeroDoPedido,
  produtosDoPedido,
  type EnvioDaRodada,
  type PedidoDaRodada,
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
