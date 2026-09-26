import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { pedidosDesde } from "../../../../lib/painel/ler"
import { lerProdutos, metadataDos } from "../../../../lib/painel/ler-produtos"
import { janelasDo, lerPedidosDesde, lerPeriodo, vendasDos } from "../../../../lib/painel/marketing"
import { caixasDos, montarOfertas } from "../../../../lib/painel/marketing-ofertas"

/**
 * GET /dashboard/marketing/ofertas?periodo=30d — o que a caixa de compra de
 * cada produto (quantas unidades ou leve junto) e a oferta do checkout
 * somam, e os cupons (`lib/painel/marketing-ofertas.ts`). Tudo da loja:
 * nada do Google. Do dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const [produtos, pedidos] = await Promise.all([
    lerProdutos(req.scope),
    pedidosDesde(req.scope, lerPedidosDesde(periodo, agora)),
  ])
  const metadata = await metadataDos(
    req.scope,
    produtos.filter((p) => p.status === "published").map((p) => p.id)
  )
  res.json({
    periodo,
    ...montarOfertas(
      caixasDos(produtos, metadata),
      vendasDos(pedidos),
      janelasDo(periodo, agora).atual
    ),
  })
}
