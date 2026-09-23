import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sincronizarEstoque } from "../../../../lib/erp/estoque"

/**
 * POST /admin/erp/estoque — a sincronização do estoque agora, sem esperar
 * os 5 minutos do job. Devolve o relatório (o mesmo que a tela mostra).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await sincronizarEstoque(req.scope)
  if (!relatorio) {
    res.status(409).json({ message: "erp_desconectado" })
    return
  }
  res.json({ relatorio })
}
