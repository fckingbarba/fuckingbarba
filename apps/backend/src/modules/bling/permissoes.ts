import type { Acesso, PermissaoNoErp } from "../../lib/erp/contrato"
import { chamarBling, type Consulta, ErroDoBling, escopoDoCaminho } from "./api"

/**
 * AS PERMISSÕES DO APP NO BLING, conferidas uma a uma.
 *
 * O 403 do Bling diz "sem permissão", e não qual escopo falta. Aqui a loja
 * lê, de cada recurso que ela usa, o mínimo possível (um item), e o que vier
 * 403 é o escopo que falta no app. Resposta 400 ou 404 também é permissão
 * dada: o Bling entrou no recurso e só não gostou da pergunta.
 *
 * "Formas de pagamento" entra na lista mesmo que a documentação de terceiros
 * diga que não pede escopo: se pedir, é aqui que aparece.
 */

const CONFERENCIAS: { caminho: string; consulta?: Consulta; paraQue: string }[] = [
  {
    caminho: "/produtos",
    consulta: { limite: 1 },
    paraQue: "o estoque e a importação dos produtos",
  },
  {
    caminho: "/estoques/saldos",
    consulta: { "idsProdutos[]": [1] },
    paraQue: "o saldo do estoque",
  },
  { caminho: "/contatos", consulta: { limite: 1 }, paraQue: "o cliente de cada nota" },
  { caminho: "/pedidos/vendas", consulta: { limite: 1 }, paraQue: "o pedido de venda FB-…" },
  { caminho: "/nfe", consulta: { limite: 1 }, paraQue: "emitir e acompanhar a nota fiscal" },
  {
    caminho: "/formas-pagamentos",
    consulta: { limite: 1 },
    paraQue: "a forma de pagamento do pedido de venda",
  },
  { caminho: "/situacoes/modulos", paraQue: "cancelar o pedido de venda de um pedido cancelado" },
  { caminho: "/empresas/me/dados-basicos", paraQue: "o nome da empresa na tela do ERP" },
]

export async function conferirPermissoes(acesso: Acesso): Promise<PermissaoNoErp[]> {
  const permissoes: PermissaoNoErp[] = []
  for (const c of CONFERENCIAS) {
    const escopo = escopoDoCaminho(c.caminho)?.escopo ?? c.caminho
    try {
      await chamarBling(acesso, "GET", c.caminho, { consulta: c.consulta })
      permissoes.push({ escopo, paraQue: c.paraQue, ok: true, motivo: null })
    } catch (e) {
      if (e instanceof ErroDoBling && e.semPermissao) {
        permissoes.push({ escopo, paraQue: c.paraQue, ok: false, motivo: null })
      } else if (e instanceof ErroDoBling && (e.status === 400 || e.status === 404)) {
        permissoes.push({ escopo, paraQue: c.paraQue, ok: true, motivo: null })
      } else {
        permissoes.push({
          escopo,
          paraQue: c.paraQue,
          ok: null,
          motivo: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }
  return permissoes
}
