import type { Acesso, PermissaoNoErp } from "../../lib/erp/contrato"
import { chamarBling, type Consulta, ErroDoBling, escopoDoCaminho } from "./api"

/**
 * AS PERMISSÕES DO APP NO BLING, conferidas uma a uma.
 *
 * O 403 do Bling diz "sem permissão", e não qual escopo falta. Aqui a loja
 * toca, de cada recurso que ela usa, o mínimo possível, e o que vier 403 é a
 * permissão que falta no app.
 *
 * LER E GRAVAR SÃO PERMISSÕES DIFERENTES. O primeiro pedido pago de verdade
 * (#14, 23/09) caiu num 403 com todas as leituras liberadas: o escopo deixava
 * ler e não criar. Então a gravação também é conferida — com um pedido que o
 * Bling recusa ANTES de gravar qualquer coisa: o cliente e o pedido de venda
 * vazios (faltam os campos obrigatórios), a nota e o pedido de id 0 (não
 * existem). Com a permissão, a resposta é 400 ou 404; sem ela, 403. Qualquer
 * 400 ou 404 é permissão dada: o Bling entrou no recurso e só não gostou da
 * pergunta.
 *
 * "Formas de pagamento" entra na lista mesmo que a documentação de terceiros
 * diga que não pede escopo: se pedir, é aqui que aparece.
 */

type Conferencia = {
  metodo: "GET" | "POST" | "PATCH" | "DELETE"
  caminho: string
  consulta?: Consulta
  corpo?: unknown
  paraQue: string
}

const CONFERENCIAS: Conferencia[] = [
  {
    metodo: "GET",
    caminho: "/produtos",
    consulta: { limite: 1 },
    paraQue: "o estoque e a importação dos produtos",
  },
  {
    metodo: "GET",
    caminho: "/estoques/saldos",
    consulta: { "idsProdutos[]": [1] },
    paraQue: "o saldo do estoque",
  },
  {
    metodo: "GET",
    caminho: "/contatos",
    consulta: { limite: 1 },
    paraQue: "achar o cliente pelo CPF",
  },
  {
    metodo: "POST",
    caminho: "/contatos",
    corpo: {},
    paraQue: "criar e atualizar o cliente da nota",
  },
  {
    metodo: "GET",
    caminho: "/pedidos/vendas",
    consulta: { limite: 1 },
    paraQue: "achar o pedido de venda FB-…",
  },
  {
    metodo: "POST",
    caminho: "/pedidos/vendas",
    corpo: {},
    paraQue: "criar o pedido de venda FB-…",
  },
  {
    metodo: "POST",
    caminho: "/pedidos/vendas/0/gerar-nfe",
    paraQue: "gerar a nota do pedido de venda",
  },
  {
    metodo: "PATCH",
    caminho: "/pedidos/vendas/0/situacoes/0",
    paraQue: "cancelar o pedido de venda de um pedido cancelado",
  },
  {
    metodo: "GET",
    caminho: "/nfe",
    consulta: { limite: 1 },
    paraQue: "acompanhar a nota fiscal",
  },
  {
    metodo: "POST",
    caminho: "/nfe/0/enviar",
    consulta: { enviarEmail: false },
    paraQue: "mandar a nota pra SEFAZ",
  },
  {
    metodo: "DELETE",
    caminho: "/nfe",
    consulta: { "idsNotas[]": [0] },
    paraQue: "apagar a nota pendente de um pedido cancelado",
  },
  {
    metodo: "GET",
    caminho: "/formas-pagamentos",
    consulta: { limite: 1 },
    paraQue: "a forma de pagamento do pedido de venda",
  },
  {
    metodo: "GET",
    caminho: "/situacoes/modulos",
    paraQue: 'achar a situação "Cancelado" dos pedidos de venda',
  },
  {
    metodo: "GET",
    caminho: "/empresas/me/dados-basicos",
    paraQue: "o nome da empresa na tela do ERP",
  },
]

/** O Bling entrou no recurso: a pergunta é que não serviu (campo faltando, id que não existe). */
const entrou = (status: number) =>
  status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429

export async function conferirPermissoes(acesso: Acesso): Promise<PermissaoNoErp[]> {
  const permissoes: PermissaoNoErp[] = []
  for (const c of CONFERENCIAS) {
    const base = {
      escopo: escopoDoCaminho(c.caminho)?.escopo ?? c.caminho,
      acao: c.metodo === "GET" ? ("ler" as const) : ("gravar" as const),
      paraQue: c.paraQue,
    }
    try {
      await chamarBling(acesso, c.metodo, c.caminho, { consulta: c.consulta, corpo: c.corpo })
      permissoes.push({ ...base, ok: true, motivo: null })
    } catch (e) {
      if (e instanceof ErroDoBling && e.semPermissao)
        permissoes.push({ ...base, ok: false, motivo: null })
      else if (e instanceof ErroDoBling && entrou(e.status))
        permissoes.push({ ...base, ok: true, motivo: null })
      else
        permissoes.push({
          ...base,
          ok: null,
          motivo: e instanceof Error ? e.message : String(e),
        })
    }
  }
  return permissoes
}
