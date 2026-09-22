import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { confirmarPedidosPagos } from "../../../../lib/confirmar-pedido"

/**
 * POST /admin/pedidos/confirmar — a varredura dos e-mails de pedido
 * confirmado agora, sem esperar os 5 minutos do worker.
 *
 * Pra quem cuida da loja depois de um "Check status" (que registra o Pix
 * pago sem avisar ninguém), e pro conferidor de pagamento provar que esse
 * caminho também confirma. Devolve o relatório — e é idempotente: rodar
 * duas vezes seguidas não manda nada na segunda.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await confirmarPedidosPagos(req.scope)
  res.json({ relatorio })
}
