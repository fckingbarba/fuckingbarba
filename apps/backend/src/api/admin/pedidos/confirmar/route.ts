import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { avisarCancelamentosRecentes } from "../../../../lib/avisar-cancelamento"
import { avisarDevolucoesRecentes } from "../../../../lib/avisar-devolucao"
import { confirmarPedidosPagos } from "../../../../lib/confirmar-pedido"

/**
 * POST /admin/pedidos/confirmar — as varreduras de e-mail de pedido agora,
 * sem esperar os 5 minutos do worker.
 *
 * AS TRÊS, como no job `confirmar-pedidos`: a dos pagos, a dos cancelados e
 * a dos pagamentos devolvidos. Este endpoint é o gêmeo sob demanda dele, e
 * gêmeo que faz metade do trabalho mente — quem roda aqui pra conferir se o
 * e-mail sai ficaria esperando um cancelamento que ninguém foi buscar.
 *
 * Pra quem cuida da loja depois de um "Check status" (que registra o Pix
 * pago sem avisar ninguém), e pro conferidor de pagamento provar que esse
 * caminho também confirma. Devolve os três relatórios — e é idempotente:
 * rodar duas vezes seguidas não manda nada na segunda.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await confirmarPedidosPagos(req.scope)
  const cancelamentos = await avisarCancelamentosRecentes(req.scope)
  const devolucoes = await avisarDevolucoesRecentes(req.scope)
  res.json({ relatorio, cancelamentos, devolucoes })
}
