import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerFunilDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/funil?periodo=30d — onde as pessoas desistem
 * (`lib/painel/marketing-funil.ts`): do site até o pagamento (o GA4), da
 * sacola ao pagamento (os carrinhos da loja) e o celular contra o
 * computador. Do dono e do marketing.
 *
 * O GOOGLE PODE FALTAR: os carrinhos vêm sempre; o site e os aparelhos vêm
 * com o `estado` — "ok", ou por que não vieram (os mesmos do `/visitas`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  res.json(await lerFunilDoMarketing(req.scope, lerPeriodo(req.query.periodo), new Date()))
}
