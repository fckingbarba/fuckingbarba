import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerOfertasDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../../lib/painel/periodo"
import { PERIODO_PADRAO } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/ofertas?periodo=30d — o que a caixa de compra de
 * cada produto (quantas unidades ou leve junto) e a oferta do checkout
 * somam, e os cupons (`lib/painel/marketing-ofertas.ts`). Tudo da loja:
 * nada do Google. Do dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  res.json(await lerOfertasDoMarketing(req.scope, periodo, agora))
}
