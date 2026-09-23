import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { situacaoDaConexao } from "../../../lib/erp/conexao"
import { erpDaTela } from "../../../lib/erp/erps"
import { notasEsperando, pendenciasDasNotas } from "../../../lib/erp/notas"

/**
 * GET /admin/erp — o que a tela do ERP mostra: se está configurado e
 * conectado, com que empresa, desde quando as notas saem sozinhas, a janela
 * antes da nota, a última sincronização de estoque, as notas que precisam de
 * alguém e as que esperam a janela fechar. Nunca os tokens.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const erp = erpDaTela()
  const situacao = await situacaoDaConexao(req.scope, erp)
  const [pendencias, esperando] = situacao.conectado
    ? await Promise.all([pendenciasDasNotas(req.scope, erp), notasEsperando(req.scope, erp)])
    : [[], []]
  res.json({ ...situacao, pendencias, esperando })
}
