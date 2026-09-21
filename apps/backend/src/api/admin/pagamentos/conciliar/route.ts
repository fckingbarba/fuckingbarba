import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { conciliarPagamentos } from "../../../../lib/conciliar-pagamentos"

/**
 * POST /admin/pagamentos/conciliar — a conciliação agora, sem esperar os 5
 * minutos do worker.
 *
 * Serve pra duas coisas: quem cuida da loja apertar quando um cliente diz
 * "paguei e o pedido não mudou", e o conferidor de pagamento provar que Pix
 * vencido devolve estoque sem ter que esperar meia hora. Devolve o relatório
 * do que foi feito — e é idempotente: rodar duas vezes seguidas não faz nada
 * na segunda.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await conciliarPagamentos(req.scope)
  res.json({ relatorio })
}
