import type { PedidoParaNota } from "../../../lib/erp/contrato"
import { chamarBling, escopoDoCaminho, motivoDoErro } from "../api"
import { emitirNota } from "../notas"
import { conferirPermissoes } from "../permissoes"

afterEach(() => jest.restoreAllMocks())

const acesso = { token: async () => "t", renovado: async () => "t" }

const PEDIDO: PedidoParaNota = {
  numero: 14,
  referencia: "FB-14",
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
      complemento: null,
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
  itens: [{ sku: "FBOL01", nome: "Óleo", quantidade: 1, precoUnitario: 54.9 }],
  desconto: 0,
  frete: 0,
  total: 54.9,
  pagamento: { forma: "pix", parcelas: 1 },
}

/** O Bling que nega (403) o que casar com `negado`, e responde `{ data: [] }` ao resto. */
const blingQueNega = (negado: RegExp, corpo = "") =>
  jest.spyOn(global, "fetch").mockImplementation(async (entrada) => {
    const url = new URL(String(entrada))
    if (negado.test(url.pathname)) return new Response(corpo, { status: 403 })
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  })

describe("o 403 do Bling: a permissão que falta no app", () => {
  it("o escopo sai do caminho, com o nome que a pessoa acha na tela de escopos", () => {
    expect(escopoDoCaminho("/contatos")).toEqual({
      escopo: "Clientes e Fornecedores",
      pra: "pro cliente",
    })
    expect(escopoDoCaminho("/pedidos/vendas/12/gerar-nfe")?.escopo).toBe("Pedidos de Venda")
    expect(escopoDoCaminho("/nfe/9/enviar")?.escopo).toBe("Notas Fiscais")
    expect(escopoDoCaminho("/algo-novo")).toBeNull()
  })

  it("403 sem corpo nenhum (foi o de produção, em 23/09): a frase diz o escopo; não é temporário", async () => {
    blingQueNega(/\/contatos/)
    await expect(chamarBling(acesso, "GET", "/contatos")).rejects.toMatchObject({
      status: 403,
      semPermissao: true,
      temporario: false,
      message:
        "o Bling negou a permissão pro cliente (403): falta no app o escopo “Clientes e Fornecedores”",
    })
  })

  it("o motivo do Bling vai junto, no formato da API ou no do OAuth", async () => {
    expect(motivoDoErro({ error: "insufficient_scope", error_description: "Escopo negado" })).toBe(
      "insufficient_scope — Escopo negado"
    )
    expect(motivoDoErro({ message: "Acesso negado" })).toBe("Acesso negado")
    blingQueNega(
      /\/nfe/,
      JSON.stringify({ error: { type: "FORBIDDEN", message: "Sem permissão" } })
    )
    await expect(chamarBling(acesso, "GET", "/nfe/1")).rejects.toMatchObject({
      message:
        "o Bling negou a permissão pra nota fiscal (403): falta no app o escopo “Notas Fiscais” (Sem permissão)",
    })
  })

  it("resposta que não é JSON (a página de um proxy) vira o começo do texto, sem tag", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("<html><h1>502 Bad Gateway</h1></html>", { status: 502 }))
    await expect(chamarBling(acesso, "GET", "/produtos")).rejects.toMatchObject({
      status: 502,
      message: "502 Bad Gateway",
    })
  })

  it("na nota, 403 não desiste: a loja segue tentando, e a equipe é chamada", async () => {
    blingQueNega(/\/contatos/)
    const salvar = jest.fn(async () => undefined)
    expect(await emitirNota(acesso, PEDIDO, {}, salvar)).toEqual({
      ok: false,
      motivo: expect.stringContaining("Clientes e Fornecedores"),
      definitivo: false,
      precisaDeGente: true,
    })
    expect(salvar).not.toHaveBeenCalled()
  })
})

describe("a conferência das permissões", () => {
  it("ler e gravar, cada um: 403 falta; 400 ou 404 é permissão dada; o resto, não deu pra conferir", async () => {
    const chamadas: string[] = []
    jest.spyOn(global, "fetch").mockImplementation(async (entrada, init) => {
      const caminho = new URL(String(entrada)).pathname.replace(/^\/Api\/v3/, "")
      const metodo = init?.method ?? "GET"
      chamadas.push(`${metodo} ${caminho}`)
      // Como em produção (23/09): lê o cliente, não cria.
      if (metodo === "POST" && caminho === "/contatos") return new Response("", { status: 403 })
      if (metodo === "POST" && caminho === "/pedidos/vendas")
        return new Response(JSON.stringify({ error: { message: "Informe o contato" } }), {
          status: 400,
        })
      if (caminho.includes("/0"))
        return new Response(JSON.stringify({ error: { message: "não existe" } }), { status: 404 })
      if (caminho === "/situacoes/modulos")
        return new Response(JSON.stringify({ error: { message: "erro interno" } }), {
          status: 500,
        })
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    const r = await conferirPermissoes(acesso)
    const de = (escopo: string, acao: "ler" | "gravar") =>
      r.filter((p) => p.escopo === escopo && p.acao === acao)
    expect(de("Clientes e Fornecedores", "ler").map((p) => p.ok)).toEqual([true])
    expect(de("Clientes e Fornecedores", "gravar").map((p) => p.ok)).toEqual([false])
    // o pedido vazio (400) e o de id 0 (404): permissão dada
    expect(de("Pedidos de Venda", "gravar").map((p) => p.ok)).toEqual([true, true, true])
    expect(de("Notas Fiscais", "gravar").map((p) => p.ok)).toEqual([true, true])
    expect(de("Gerenciador de transições", "ler")[0]).toMatchObject({
      ok: null,
      motivo: "erro interno",
    })
    // a gravação vai com o pedido que o Bling recusa: vazio, ou de id 0
    expect(chamadas).toEqual(
      expect.arrayContaining([
        "POST /contatos",
        "POST /pedidos/vendas",
        "POST /pedidos/vendas/0/gerar-nfe",
        "PATCH /pedidos/vendas/0/situacoes/0",
        "POST /nfe/0/enviar",
        "DELETE /nfe",
      ])
    )
    expect(r).toHaveLength(14)
  }, 60_000)

  it("gravar sem permissão: a frase diz que falta gravar, não o escopo inteiro", async () => {
    blingQueNega(/\/contatos/)
    await expect(chamarBling(acesso, "POST", "/contatos", { corpo: {} })).rejects.toMatchObject({
      message:
        "o Bling negou a permissão pro cliente (403): falta no app o escopo “Clientes e Fornecedores” com a permissão de gravar (inserir e editar)",
    })
  })
})

describe("o cliente que o Bling não deixa atualizar", () => {
  it("a nota sai com o cadastro que está lá, e volta com o aviso pra equipe conferir", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (entrada, init) => {
      const url = new URL(String(entrada))
      const caminho = url.pathname.replace(/^\/Api\/v3/, "")
      const metodo = init?.method ?? "GET"
      const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status })
      if (caminho === "/contatos" && metodo === "GET")
        return json({ data: [{ id: 7, numeroDocumento: "123.456.789-09", situacao: "A" }] })
      if (caminho === "/contatos/7" && metodo === "GET")
        return json({ data: { id: 7, nome: "Nome Antigo", email: "outra@exemplo.com" } })
      if (caminho === "/contatos/7" && metodo === "PUT")
        return json({ error: { message: "Não foi possível salvar o contato" } }, 400)
      if (caminho === "/pedidos/vendas" && metodo === "GET") return json({ data: [] })
      if (caminho === "/formas-pagamentos")
        return json({ data: [{ id: 12, tipoPagamento: 17, situacao: 1, finalidade: 2 }] })
      if (caminho === "/produtos")
        return json({
          data: [{ id: 99, codigo: "FBOL01", situacao: "A", estoque: { saldoVirtualTotal: 5 } }],
        })
      if (caminho === "/pedidos/vendas" && metodo === "POST")
        return json({ data: { id: 500 } }, 201)
      if (caminho === "/pedidos/vendas/500") return json({ data: { id: 500, notaFiscal: null } })
      if (caminho === "/pedidos/vendas/500/gerar-nfe") return json({ idNotaFiscal: 900 }, 201)
      if (caminho === "/nfe/900" && metodo === "GET")
        return json({
          data: {
            id: 900,
            situacao: 5,
            numero: "000001",
            serie: 1,
            chaveAcesso: "4226",
            valorNota: 54.9,
          },
        })
      return json({ error: { message: `não esperado: ${metodo} ${caminho}` } }, 404)
    })
    const r = await emitirNota(acesso, PEDIDO, {}, async () => undefined)
    expect(r).toMatchObject({
      ok: true,
      nota: { situacao: "autorizada" },
      avisos: [
        expect.stringContaining(
          "o cadastro do cliente no Bling não foi atualizado com este pedido (Não foi possível salvar o contato)"
        ),
      ],
    })
  }, 30_000)
})

describe("a janela de cancelamento: o pedido de venda na hora, a nota depois", () => {
  it("com `ate: 'pedido'`, para no pedido de venda; a chamada seguinte continua dali, sem outro pedido", async () => {
    const chamadas: string[] = []
    let situacaoDaNota = 1
    jest.spyOn(global, "fetch").mockImplementation(async (entrada, init) => {
      const caminho = new URL(String(entrada)).pathname.replace(/^\/Api\/v3/, "")
      const metodo = init?.method ?? "GET"
      chamadas.push(`${metodo} ${caminho}`)
      const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status })
      if (caminho === "/contatos" && metodo === "GET") return json({ data: [] })
      if (caminho === "/contatos" && metodo === "POST") return json({ data: { id: 7 } }, 201)
      if (caminho === "/pedidos/vendas" && metodo === "GET") return json({ data: [] })
      if (caminho === "/formas-pagamentos")
        return json({ data: [{ id: 12, tipoPagamento: 17, situacao: 1, finalidade: 2 }] })
      if (caminho === "/produtos")
        return json({
          data: [{ id: 99, codigo: "FBOL01", situacao: "A", estoque: { saldoVirtualTotal: 5 } }],
        })
      if (caminho === "/pedidos/vendas" && metodo === "POST")
        return json({ data: { id: 500 } }, 201)
      if (caminho === "/pedidos/vendas/500") return json({ data: { id: 500, notaFiscal: null } })
      if (caminho === "/pedidos/vendas/500/gerar-nfe") return json({ idNotaFiscal: 900 }, 201)
      if (caminho === "/nfe/900/enviar") {
        situacaoDaNota = 5
        return json({ data: {} })
      }
      if (caminho === "/nfe/900" && metodo === "GET")
        return json({
          data: {
            id: 900,
            situacao: situacaoDaNota,
            numero: "000002",
            serie: 1,
            chaveAcesso: "42",
          },
        })
      return json({ error: { message: `não esperado: ${metodo} ${caminho}` } }, 404)
    })
    let passos: Record<string, unknown> = {}
    const salvar = async (p: Record<string, unknown>) => {
      passos = p
    }

    const naHora = await emitirNota(acesso, PEDIDO, {}, salvar, { ate: "pedido" })
    expect(naHora).toEqual({ ok: true, nota: null })
    expect(passos).toEqual({ contato: 7, pedido: 500 })
    expect(chamadas.filter((c) => /nfe/.test(c))).toEqual([])

    chamadas.length = 0
    const depois = await emitirNota(acesso, PEDIDO, passos, salvar)
    expect(depois).toMatchObject({ ok: true, nota: { situacao: "autorizada", numero: "000002" } })
    expect(passos).toEqual({ contato: 7, pedido: 500, nota: 900 })
    expect(chamadas.filter((c) => c === "POST /contatos" || c === "POST /pedidos/vendas")).toEqual(
      []
    )
  }, 30_000)
})
