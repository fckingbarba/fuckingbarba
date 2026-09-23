import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { acompanharNotas } from "../../../../lib/erp/notas"

/**
 * POST /admin/erp/notas — a varredura das notas agora: as que estão na
 * SEFAZ, as dos pedidos cancelados, e os pedidos pagos sem nota. É
 * idempotente — nota que já saiu não sai de novo.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ relatorio: await acompanharNotas(req.scope) })
}
