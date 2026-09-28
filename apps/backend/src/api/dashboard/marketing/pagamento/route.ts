import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerPagamentoDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../../lib/painel/periodo"
import { PERIODO_PADRAO } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/pagamento?periodo=30d — como as pessoas pagam, o
 * que não passa (o Pix que vence, o cartão recusado e por quem) e o que o
 * frete faz com a venda (`lib/painel/marketing-pagamento.ts`), e os parceiros
 * de pagamento lado a lado (`marketing-parceiros.ts`). Tudo da loja: o estado
 * que cada parceiro deixa na sessão e as tentativas anotadas pela porta do
 * `complete`. Do dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  res.json(await lerPagamentoDoMarketing(req.scope, periodo, agora))
}
