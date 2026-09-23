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
        "o Bling negou a permissão pro cliente (403): falta o escopo “Clientes e Fornecedores” no app",
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
        "o Bling negou a permissão pra nota fiscal (403): falta o escopo “Notas Fiscais” no app (Sem permissão)",
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
  it("403 é o escopo que falta; 400 ou 404 é permissão dada; o resto, não deu pra conferir", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (entrada) => {
      const caminho = new URL(String(entrada)).pathname
      if (caminho.endsWith("/contatos")) return new Response("", { status: 403 })
      if (caminho.endsWith("/estoques/saldos"))
        return new Response(JSON.stringify({ error: { message: "id inválido" } }), { status: 400 })
      if (caminho.endsWith("/situacoes/modulos"))
        return new Response(JSON.stringify({ error: { message: "erro interno" } }), {
          status: 500,
        })
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    const r = await conferirPermissoes(acesso)
    const de = (escopo: string) => r.find((p) => p.escopo === escopo)
    expect(de("Clientes e Fornecedores")).toMatchObject({ ok: false })
    expect(de("Controle de Estoque")).toMatchObject({ ok: true })
    expect(de("Gerenciador de transições")).toMatchObject({ ok: null, motivo: "erro interno" })
    expect(de("Produtos")?.ok).toBe(true)
    expect(de("Pedidos de Venda")?.ok).toBe(true)
    expect(de("Notas Fiscais")?.ok).toBe(true)
    expect(r).toHaveLength(8)
  }, 30_000)
})
