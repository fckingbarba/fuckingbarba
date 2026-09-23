import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { iniciarAutorizacao } from "../../../../lib/erp/conexao"
import { erpDaLoja } from "../../../../lib/erp/erps"

/**
 * POST /admin/erp/conectar — o endereço da tela de autorização do ERP, pro
 * navegador de quem clicou em "Conectar". A volta é por
 * `/hooks/erp/<id>/autorizado` (`lib/erp/conexao.ts`).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const erp = erpDaLoja()
  if (!erp) {
    res.status(400).json({ message: "erp_nao_configurado" })
    return
  }
  res.json({ url: await iniciarAutorizacao(req.scope, erp) })
}
