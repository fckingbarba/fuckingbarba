import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { podeAbrir } from "../../../lib/equipe/regras"
import { estoquesDos, lerProdutos, precosDos } from "../../../lib/painel/ler-produtos"
import {
  ehFiltroDeProduto,
  FILTROS_DE_PRODUTO,
  linhaDoProduto,
  passaNoFiltroDeProduto,
  type FiltroDeProduto,
} from "../../../lib/painel/produtos"

/**
 * GET /dashboard/produtos?filtro=rascunho — os produtos, com a situação
 * (no site, rascunho, esgotado), o preço (com a promoção valendo) e o
 * estoque de cada um, e quantos cabem em cada fita. Todo papel abre; quem
 * edita é outra pergunta (`editarProdutos`: a promoção, aqui na lista, e a
 * página do produto) — `podeEditar` diz à tela se mostra o botão.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "produtos")) return

  const filtro: FiltroDeProduto = ehFiltroDeProduto(req.query.filtro) ? req.query.filtro : "todos"
  const produtos = await lerProdutos(req.scope)
  const [estoques, precos] = await Promise.all([
    estoquesDos(req.scope, produtos),
    precosDos(req.scope, produtos),
  ])
  const linhas = produtos.map((p) =>
    linhaDoProduto(p, estoques.get(p.id) ?? null, precos.get(p.id))
  )

  res.json({
    produtos: linhas.filter((l) => passaNoFiltroDeProduto(l, filtro)),
    contagem: Object.fromEntries(
      FILTROS_DE_PRODUTO.map((f) => [f, linhas.filter((l) => passaNoFiltroDeProduto(l, f)).length])
    ),
    filtro,
    podeEditar: podeAbrir(pedido.membro.papel, "editarProdutos"),
  })
}
