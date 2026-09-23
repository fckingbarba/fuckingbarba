import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { registrarPendentes } from "../../../../lib/envios/registro"

/**
 * POST /admin/envios/registrar — a varredura dos pedidos pro painel do
 * parceiro agora, sem esperar os 10 minutos do worker.
 *
 * Pra quem cuida da loja apertar quando um pedido pago não apareceu no
 * painel da Frenet, e pro conferidor de envios. Devolve o relatório — e é
 * idempotente: pedido que já entrou não entra de novo. Sem o token de
 * parceiro, o relatório volta vazio.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await registrarPendentes(req.scope)
  res.json({ relatorio })
}
