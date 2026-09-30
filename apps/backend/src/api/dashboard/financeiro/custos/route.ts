import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { gravarValor } from "../../../../lib/financeiro/gravar"
import { doFinanceiro } from "../../../../lib/financeiro/ler"
import {
  lerCustos,
  telaDosCustos,
  type ProdutoLido,
} from "../../../../lib/financeiro/tela-dos-custos"
import { anotar } from "../../../../lib/painel/anotar"
import { lerProdutos, precosDos } from "../../../../lib/painel/ler-produtos"
import { linhaDoProduto } from "../../../../lib/painel/produtos"

/** Os produtos com o nome, a foto e o que a loja cobra hoje por uma unidade. */
async function produtosDosCustos(container: MedusaContainer): Promise<ProdutoLido[]> {
  const produtos = await lerProdutos(container)
  const precos = await precosDos(container, produtos)
  return produtos.map((p) => {
    const l = linhaDoProduto(p, null, precos.get(p.id))
    return {
      id: l.id,
      nome: l.nome,
      foto: l.foto,
      publicado: l.publicado,
      preco: l.promocao?.por ?? l.preco,
    }
  })
}

/**
 * GET /dashboard/financeiro/custos — o custo de cada produto que vale hoje
 * (com o preço e o que sobra de uma unidade), a embalagem por pedido e a
 * alíquota do Simples de cada mês (`lib/financeiro/tela-dos-custos.ts`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const [produtos, { valores }] = await Promise.all([
    produtosDosCustos(req.scope),
    doFinanceiro(req.scope),
  ])
  res.json(telaDosCustos(produtos, valores, new Date()))
}

/**
 * POST /dashboard/financeiro/custos — `{ custos: [{ produto, valor, desde }],
 * embalagem: { valor, desde } }`: o custo de cada produto (e a embalagem)
 * valendo a partir do dia `desde`. As vendas de antes desse dia seguem com o
 * custo de antes. Valor vazio tira o daquele dia.
 *
 * RESPOSTAS: 200 `{ ok, mudaram }`; 422 `{ erro: "campo", campo, produto }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const produtos = await produtosDosCustos(req.scope)
  const lido = lerCustos(req.body, new Set(produtos.map((p) => p.id)), new Date())
  if (!lido.ok) {
    res.status(422).json({ erro: "campo", campo: lido.campo, produto: lido.produto })
    return
  }
  let mudaram = 0
  for (const v of lido.valores)
    if ((await gravarValor(req.scope, v.chave, v.desde, v.valor)) !== "nada") mudaram++
  if (mudaram)
    await anotar(pedido, "mudou-custos", "financeiro", {
      valores: lido.valores.map((v) => ({ chave: v.chave, desde: v.desde, valor: v.valor })),
    })
  res.json({ ok: true, mudaram })
}
