import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerCanaisDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../../lib/painel/periodo"
import { PERIODO_PADRAO } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/canais?periodo=30d — de onde vêm as visitas e as
 * vendas, e as campanhas (`lib/painel/marketing-canais.ts`). Do dono e do
 * marketing.
 *
 * Vem sempre, com ou sem o Google: `pagos` (os pedidos pagos da loja no
 * período), `loja` (o endereço, pro montador de link — o `LOJA_URL`) e
 * `paginas` (a home, a vitrine e os produtos publicados). Os canais, as
 * campanhas e o `semOrigem` vêm com `estado: "ok"`; sem o Google, o
 * `estado` diz por quê (os mesmos do `/visitas`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  res.json(await lerCanaisDoMarketing(req.scope, periodo, agora))
}
