import type { PedidoParaNota } from "../../../lib/erp/contrato"
import { chamarBling, motivoDoErro } from "../api"
import { renovar, urlDeAutorizacao } from "../autorizacao"
import { assinaturaDoCorpo, lerAviso } from "../avisos"
import {
  contatoAtualizado,
  corpoDoContato,
  corpoDoPedidoDeVenda,
  escolherFormaDePagamento,
  lerNota,
  lerPassos,
} from "../notas"
import { lerProdutos, lerSaldosDosIds } from "../produtos"

const ambiente = { ...process.env }
afterEach(() => {
  process.env = { ...ambiente }
  jest.restoreAllMocks()
})

const PEDIDO: PedidoParaNota = {
  numero: 1042,
  referencia: "FB-1042",
  data: "2026-09-23",
  cliente: {
    nome: "Ana Souza",
    documento: { tipo: "cpf", valor: "12345678909" },
    email: "ana@exemplo.com",
    telefone: "47999887766",
    endereco: {
      cep: "89010000",
      rua: "Rua XV de Novembro",
      numero: "100",
      complemento: "Sala 2",
      bairro: "Centro",
      cidade: "Blumenau",
      uf: "SC",
    },
  },
  entrega: {
    nome: "Ana Souza",
    cep: "89010000",
    rua: "Rua XV de Novembro",
    numero: "100",
    complemento: null,
    bairro: "Centro",
    cidade: "Blumenau",
    uf: "SC",
  },
  itens: [
    { sku: "FBOL01", nome: "Óleo para Barba", quantidade: 2, precoUnitario: 52.7 },
    { sku: "FBBM01", nome: "Balm — Cedro", quantidade: 1, precoUnitario: 39.9 },
  ],
  desconto: 20.59,
  frete: 19.9,
  total: 144.61,
  pagamento: { forma: "pix", parcelas: 1 },
}

describe("o cliente no Bling", () => {
  it("pessoa física, não contribuinte, com o endereço em partes", () => {
    expect(corpoDoContato(PEDIDO)).toEqual({
      nome: "Ana Souza",
      situacao: "A",
      tipo: "F",
      numeroDocumento: "12345678909",
      indicadorIe: 9,
      email: "ana@exemplo.com",
      emailNotaFiscal: "ana@exemplo.com",
      telefone: "47999887766",
      celular: "47999887766",
      endereco: {
        geral: {
          endereco: "Rua XV de Novembro",
          numero: "100",
          complemento: "Sala 2",
          bairro: "Centro",
          cep: "89010-000",
          municipio: "Blumenau",
          uf: "SC",
        },
      },
    })
    expect(
      corpoDoContato({
        ...PEDIDO,
        cliente: { ...PEDIDO.cliente, documento: { tipo: "cnpj", valor: "12ABC34501DE35" } },
      }).tipo
    ).toBe("J")
  })

  it("contato igual não é regravado; o telefone vale pelos dígitos", () => {
    const existente = { id: 7, ...corpoDoContato(PEDIDO) }
    expect(contatoAtualizado(existente, PEDIDO)).toBeNull()
    expect(
      contatoAtualizado(
        { ...existente, telefone: "(47) 99988-7766", celular: "47 99988-7766" },
        PEDIDO
      )
    ).toBeNull()
  })

  it("o cadastro antigo com o e-mail e o telefone de outra pessoa: quem comprou agora vai na nota", () => {
    // Como no primeiro pedido de teste (23/09): o CPF certo, o resto de outro cliente.
    const existente = {
      id: 7,
      ...corpoDoContato(PEDIDO),
      email: "ana@exemplo.com",
      emailNotaFiscal: "outra.pessoa@exemplo.com",
      telefone: "(11) 95428-3743",
      celular: "(11) 95428-3743",
    }
    expect(contatoAtualizado(existente, PEDIDO)).toMatchObject({
      email: "ana@exemplo.com",
      emailNotaFiscal: "ana@exemplo.com",
      telefone: "47999887766",
      celular: "47999887766",
    })
  })

  it("endereço novo regrava o contato INTEIRO — sem o id, e sem perder o que a equipe cadastrou", () => {
    const existente = {
      id: 7,
      ...corpoDoContato(PEDIDO),
      vendedor: { id: 3 },
      endereco: {
        geral: { ...corpoDoContato(PEDIDO).endereco.geral, numero: "99" },
        cobranca: { cep: "1" },
      },
    }
    const novo = contatoAtualizado(existente, PEDIDO)!
    expect(novo).not.toHaveProperty("id")
    expect(novo.vendedor).toEqual({ id: 3 })
    expect((novo.endereco as { geral: { numero: string }; cobranca: unknown }).geral.numero).toBe(
      "100"
    )
    expect((novo.endereco as { cobranca: unknown }).cobranca).toEqual({ cep: "1" })
  })
})

describe("o pedido de venda", () => {
  it("com o nome FB-, os itens pelo id do Bling, o desconto em reais e a parcela do total", () => {
    const corpo = corpoDoPedidoDeVenda(PEDIDO, {
      contato: 7,
      produtos: new Map([
        ["FBOL01", 101],
        ["FBBM01", 102],
      ]),
      formaDePagamento: 55,
    })
    expect(corpo).toMatchObject({
      numeroLoja: "FB-1042",
      data: "2026-09-23",
      contato: { id: 7 },
      desconto: { valor: 20.59, unidade: "REAL" },
      transporte: { fretePorConta: 0, frete: 19.9 },
      parcelas: [{ dataVencimento: "2026-09-23", valor: 144.61, formaPagamento: { id: 55 } }],
    })
    expect(corpo.itens).toEqual([
      {
        codigo: "FBOL01",
        descricao: "Óleo para Barba",
        unidade: "UN",
        quantidade: 2,
        valor: 52.7,
        produto: { id: 101 },
      },
      {
        codigo: "FBBM01",
        descricao: "Balm — Cedro",
        unidade: "UN",
        quantidade: 1,
        valor: 39.9,
        produto: { id: 102 },
      },
    ])
    // A soma fecha: itens − desconto + frete = o que a pessoa pagou.
    const itens = corpo.itens.reduce((s, i) => s + i.valor * i.quantidade, 0)
    expect(Math.round((itens - 20.59 + 19.9) * 100) / 100).toBe(144.61)
  })

  it("sem desconto, sem o campo", () => {
    const corpo = corpoDoPedidoDeVenda(
      { ...PEDIDO, desconto: 0 },
      { contato: 7, produtos: new Map(), formaDePagamento: 1 }
    )
    expect(corpo).not.toHaveProperty("desconto")
  })

  it("a forma de pagamento: a ativa do tipo (17 Pix, 3 cartão), senão a padrão", () => {
    const formas = {
      data: [
        { id: 1, tipoPagamento: 15, situacao: 1, padrao: 1, finalidade: 3 },
        { id: 2, tipoPagamento: 17, situacao: 1, padrao: 0, finalidade: 2 },
        { id: 3, tipoPagamento: 3, situacao: 1, padrao: 0, finalidade: 1 },
        { id: 4, tipoPagamento: 3, situacao: 1, padrao: 0, finalidade: 3 },
      ],
    }
    expect(escolherFormaDePagamento(formas, "pix")).toBe(2)
    // A 3 é só de pagamentos (contas a pagar): não serve pra venda.
    expect(escolherFormaDePagamento(formas, "cartao")).toBe(4)
    expect(escolherFormaDePagamento(formas, "outra")).toBe(1)
    expect(escolherFormaDePagamento({ data: [] }, "pix")).toBeNull()
  })

  it("os passos guardados: só ids de verdade", () => {
    expect(lerPassos({ contato: 7, pedido: "8", nota: 0, lixo: 1 })).toEqual({
      contato: 7,
      pedido: undefined,
      nota: undefined,
    })
  })
})

describe("a nota no Bling → na língua da loja", () => {
  const nota = (situacao: number, extra: Record<string, unknown> = {}) => ({
    data: {
      situacao,
      numero: "001234",
      serie: 1,
      chaveAcesso: "42260912345678000199550010000012341000012345",
      dataEmissao: "2026-09-23 14:30:00",
      valorNota: 144.61,
      linkDanfe: "https://www.bling.com.br/doc.view.php?id=abc",
      ...extra,
    },
  })

  it("5 e 6 são autorizada — com a hora de Brasília em ISO", () => {
    expect(lerNota(nota(5))).toEqual({
      situacao: "autorizada",
      detalhe: "Autorizada",
      numero: "001234",
      serie: "1",
      chave: "42260912345678000199550010000012341000012345",
      emitidaEm: "2026-09-23T17:30:00.000Z",
      valor: 144.61,
      linkDanfe: "https://www.bling.com.br/doc.view.php?id=abc",
    })
    expect(lerNota(nota(6)).situacao).toBe("autorizada")
  })

  it("1 é pendente; 3, 8 e 10 são a SEFAZ sem resposta; 4 e 11, rejeitada; 9, denegada; 2, cancelada", () => {
    expect(lerNota(nota(1)).situacao).toBe("pendente")
    for (const c of [3, 8, 10]) expect(lerNota(nota(c)).situacao).toBe("processando")
    expect(lerNota(nota(4)).situacao).toBe("rejeitada")
    expect(lerNota(nota(11))).toMatchObject({
      situacao: "rejeitada",
      detalhe: expect.stringContaining("Bloqueada"),
    })
    expect(lerNota(nota(9)).situacao).toBe("denegada")
    expect(lerNota(nota(2)).situacao).toBe("cancelada")
    expect(lerNota(nota(1)).emitidaEm).toBeNull()
  })

  it("situação que o Bling inventar depois vira 'processando' — a varredura volta a perguntar", () => {
    expect(lerNota(nota(42))).toMatchObject({
      situacao: "processando",
      detalhe: expect.stringContaining("42"),
    })
  })
})

describe("os produtos pelo SKU", () => {
  it("só os ativos, com o código idêntico; o primeiro vale", () => {
    const achados = lerProdutos(
      {
        data: [
          { id: 1, codigo: "FBOL01", situacao: "A", estoque: { saldoVirtualTotal: 12 } },
          { id: 2, codigo: "FBOL01", situacao: "A", estoque: { saldoVirtualTotal: 99 } },
          { id: 3, codigo: "FBBM01", situacao: "I", estoque: { saldoVirtualTotal: 5 } },
          { id: 4, codigo: "fbsh01", situacao: "A", estoque: { saldoVirtualTotal: 5 } },
          { id: 5, codigo: "FBKIT01", situacao: "A" },
        ],
      },
      ["FBOL01", "FBBM01", "FBSH01", "FBKIT01"]
    )
    expect([...achados.values()]).toEqual([
      { id: 1, sku: "FBOL01", saldo: 12 },
      { id: 5, sku: "FBKIT01", saldo: null },
    ])
  })

  it("o saldo pelo id, de /estoques/saldos", () => {
    expect(
      lerSaldosDosIds({
        data: [{ produto: { id: 5 }, saldoVirtualTotal: 3 }, { produto: { id: 6 } }],
      })
    ).toEqual(new Map([[5, 3]]))
  })
})

describe("o aviso do Bling", () => {
  const corpo = { eventId: "e1", event: "stock.updated", data: { produto: { id: 1 } } }
  const chegada = (c: unknown, assinatura?: string) => {
    const bruto = JSON.stringify(c)
    return {
      cabecalhos: { "x-bling-signature-256": assinatura ?? assinaturaDoCorpo(bruto, "segredo") },
      consulta: {},
      corpo: c,
      bruto,
    }
  }
  beforeEach(() => {
    process.env.BLING_CLIENT_SECRET = "segredo"
  })

  it("assinado com o segredo do app, entra; estoque vira 'sincronize'", () => {
    expect(lerAviso(chegada(corpo))).toEqual({ ok: true, estoque: true, notas: [] })
    expect(lerAviso(chegada({ ...corpo, event: "virtual_stock.updated" }))).toMatchObject({
      estoque: true,
    })
  })

  it("nota vira 'consulte esta nota'", () => {
    expect(lerAviso(chegada({ event: "invoice.updated", data: { id: 555, situacao: 5 } }))).toEqual(
      {
        ok: true,
        estoque: false,
        notas: ["555"],
      }
    )
  })

  it("assinatura errada, ou sem ela, não; sem o segredo no ambiente, nada entra", () => {
    expect(lerAviso(chegada(corpo, "sha256=00"))).toMatchObject({
      ok: false,
      motivo: "nao-autorizado",
    })
    expect(lerAviso({ ...chegada(corpo), cabecalhos: {} })).toMatchObject({
      ok: false,
      motivo: "nao-autorizado",
    })
    delete process.env.BLING_CLIENT_SECRET
    expect(lerAviso(chegada(corpo))).toMatchObject({ ok: false, motivo: "sem-configuracao" })
  })

  it("o que não é aviso do Bling, ilegível; recurso que não interessa, entendido e ignorado", () => {
    expect(lerAviso(chegada({ foo: 1 }))).toMatchObject({ ok: false, motivo: "ilegivel" })
    expect(lerAviso(chegada({ event: "order.created", data: { id: 1 } }))).toEqual({
      ok: true,
      estoque: false,
      notas: [],
    })
  })
})

describe("a autorização", () => {
  it("o endereço da tela do Bling leva o client id e o estado", () => {
    process.env.BLING_CLIENT_ID = "cliente-1"
    const url = new URL(urlDeAutorizacao("estado-1"))
    expect(`${url.origin}${url.pathname}`).toBe("https://www.bling.com.br/Api/v3/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cliente-1",
      state: "estado-1",
    })
  })

  it("renovação recusada (400) derruba a conexão; o Bling fora do ar, não", async () => {
    process.env.BLING_CLIENT_ID = "c"
    process.env.BLING_CLIENT_SECRET = "s"
    const c = { acesso: "a", renovacao: "r", expiraEm: new Date().toISOString() }
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { type: "invalid_grant", message: "Invalid refresh token" } }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "a2", refresh_token: "r2", expires_in: 21600 }),
          { status: 200 }
        )
      )
    expect(await renovar(c)).toMatchObject({
      ok: false,
      caiu: true,
      motivo: "Invalid refresh token",
    })
    expect(await renovar(c)).toMatchObject({ ok: false, caiu: false })
    const r = await renovar(c)
    expect(r).toMatchObject({ ok: true, credenciais: { acesso: "a2", renovacao: "r2" } })
  })

  it("o client id e o secret vão SÓ no cabeçalho, e o JWT é pedido", async () => {
    process.env.BLING_CLIENT_ID = "c"
    process.env.BLING_CLIENT_SECRET = "s"
    const chamada = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "a", refresh_token: "r" }), { status: 200 })
      )
    await renovar({ acesso: "a", renovacao: "r0", expiraEm: "" })
    const [url, init] = chamada.mock.calls[0]!
    expect(url).toBe("https://api.bling.com.br/Api/v3/oauth/token")
    expect(init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("c:s").toString("base64")}`,
      "enable-jwt": "1",
    })
    expect(String(init?.body)).toBe("grant_type=refresh_token&refresh_token=r0")
  })
})

describe("as chamadas", () => {
  const acesso = (tokens: string[]) => {
    let i = 0
    return { token: async () => tokens[0]!, renovado: jest.fn(async () => tokens[++i] ?? "sem") }
  }

  it("o erro do Bling vira uma linha", () => {
    expect(
      motivoDoErro({
        error: {
          type: "VALIDATION_ERROR",
          message: "Não foi possível salvar a venda",
          description: "Não foi possível salvar a venda",
          fields: [{ msg: "Informe o contato", element: "contato" }],
        },
      })
    ).toBe("Não foi possível salvar a venda — Informe o contato")
    expect(motivoDoErro({ data: 1 })).toBeNull()
  })

  it("401 troca o token e repete; lista vai como `codigos[]` repetido; o JWT em toda chamada", async () => {
    const a = acesso(["velho", "novo"])
    const chamada = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    const r = await chamarBling(a, "GET", "/produtos", {
      consulta: { "codigos[]": ["A", "B"], criterio: 2 },
    })
    expect(r.corpo).toEqual({ data: [] })
    expect(a.renovado).toHaveBeenCalledWith("velho")
    const [url, init] = chamada.mock.calls[1]!
    expect(String(url)).toBe(
      "https://api.bling.com.br/Api/v3/produtos?codigos%5B%5D=A&codigos%5B%5D=B&criterio=2"
    )
    expect(init?.headers).toMatchObject({ authorization: "Bearer novo", "enable-jwt": "1" })
  })

  it("429 espera e tenta de novo; 400 é erro de dado, que não passa sozinho", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: "TOO_MANY_REQUESTS" } }), { status: 429 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 1 } }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "O valor do campo cidade não foi encontrado no sistema." },
          }),
          {
            status: 400,
          }
        )
      )
    const a = acesso(["t"])
    expect((await chamarBling(a, "POST", "/contatos", { corpo: {} })).status).toBe(201)
    await expect(chamarBling(a, "POST", "/contatos", { corpo: {} })).rejects.toMatchObject({
      status: 400,
      temporario: false,
      message: "O valor do campo cidade não foi encontrado no sistema.",
    })
  }, 15_000)
})
