import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { lerPeriodoDoCrm, montarTelaDoCrm } from "../../../lib/painel/crm"
import { janelasDo } from "../../../lib/painel/marketing"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"

/**
 * GET /dashboard/crm?periodo=hoje|7d|30d — o que a loja anotou de cada
 * pessoa no período (`lib/painel/crm.ts`): quantos navegadores, quantos já
 * têm e-mail, cada tipo de anotação e as últimas, com o e-mail mascarado.
 * Do dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "crm")) return
  const periodo = lerPeriodoDoCrm(req.query.periodo)
  const agora = new Date()
  const { atual } = janelasDo(periodo, agora)
  const contas = await req.scope.resolve<CrmService>(CRM).resumo(atual.de, agora)
  res.json(montarTelaDoCrm({ periodo, ...contas }, agora))
}
