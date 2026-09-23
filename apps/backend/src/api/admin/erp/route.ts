import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { situacaoDaConexao } from "../../../lib/erp/conexao"
import { erpDaTela } from "../../../lib/erp/erps"
import { pendenciasDasNotas } from "../../../lib/erp/notas"

/**
 * GET /admin/erp — o que a tela do ERP mostra: se está configurado e
 * conectado, com que empresa, desde quando as notas saem sozinhas, a última
 * sincronização de estoque e as notas que precisam de alguém. Nunca os
 * tokens.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const erp = erpDaTela()
  const situacao = await situacaoDaConexao(req.scope, erp)
  const pendencias = situacao.conectado ? await pendenciasDasNotas(req.scope, erp) : []
  res.json({ ...situacao, pendencias })
}
