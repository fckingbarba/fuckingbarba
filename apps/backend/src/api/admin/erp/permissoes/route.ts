import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { conferirPermissoes } from "../../../../lib/erp/conexao"
import { erpDaTela } from "../../../../lib/erp/erps"

/**
 * POST /admin/erp/permissoes — cada escopo que a loja usa, conferido no ERP
 * agora (uma leitura inofensiva de cada recurso). É o que diz qual permissão
 * falta no app quando o ERP responde "sem permissão" (403).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const permissoes = await conferirPermissoes(req.scope, erpDaTela())
  if (!permissoes) {
    res.status(409).json({ message: "erp_desconectado" })
    return
  }
  res.json({ permissoes })
}
