import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { avisarCancelamentosRecentes } from "../../../../lib/avisar-cancelamento"
import { avisarDevolucoesRecentes } from "../../../../lib/avisar-devolucao"
import { avisarVendasRecentes } from "../../../../lib/avisar-venda"
import { confirmarPedidosPagos } from "../../../../lib/confirmar-pedido"

/**
 * POST /admin/pedidos/confirmar — as varreduras de e-mail de pedido agora,
 * sem esperar os 5 minutos do worker.
 *
 * AS QUATRO, como no job `confirmar-pedidos`: a dos pagos, a dos cancelados,
 * a dos pagamentos devolvidos e a do aviso de venda nova pro dono. Este
 * endpoint é o gêmeo sob demanda dele, e gêmeo que faz metade do trabalho
 * mente — quem roda aqui pra conferir se o e-mail sai ficaria esperando um
 * cancelamento que ninguém foi buscar.
 *
 * Pra quem cuida da loja depois de um "Check status" (que registra o Pix
 * pago sem avisar ninguém), e pro conferidor de pagamento provar que esse
 * caminho também confirma. Devolve os quatro relatórios — e é idempotente:
 * rodar duas vezes seguidas não manda nada na segunda.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await confirmarPedidosPagos(req.scope)
  const cancelamentos = await avisarCancelamentosRecentes(req.scope)
  const devolucoes = await avisarDevolucoesRecentes(req.scope)
  const vendas = await avisarVendasRecentes(req.scope)
  res.json({ relatorio, cancelamentos, devolucoes, vendas })
}
