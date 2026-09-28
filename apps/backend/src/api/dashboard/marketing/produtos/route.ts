import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerProdutosDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../../lib/painel/periodo"
import { PERIODO_PADRAO } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/produtos?periodo=30d — o que cada produto atrai,
 * põe na sacola e vende, com os sinais (esgotado, acabando, muita visita e
 * pouca sacola) — `lib/painel/marketing-produtos.ts`. Do dono e do
 * marketing.
 *
 * Sem o Google, a lista vem do mesmo jeito (o vendido, a receita e o
 * estoque são da loja), com as visitas em branco e o `estado` dizendo por quê.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  res.json(await lerProdutosDoMarketing(req.scope, periodo, agora))
}
