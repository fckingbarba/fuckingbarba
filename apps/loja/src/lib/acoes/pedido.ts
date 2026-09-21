"use server"

import { ehDeQuemComprou, situacaoDoPedido } from "@/lib/pedido"

/**
 * "E aí, o Pix caiu?" — a pergunta que a tela de obrigado faz de tempos em
 * tempos enquanto o pagamento não chega.
 *
 * Só responde a quem tem o crachá do pedido (o cookie de quem comprou), pelo
 * mesmo motivo da própria tela: server action é POST público, e id de pedido
 * vaza em print e em link encaminhado. Pra quem não tem o crachá a resposta é
 * `null` — que a tela trata como "não sei", e continua como estava.
 */
export async function perguntarPagamento(
  pedidoId: string
): Promise<{ pago: boolean; cancelado: boolean } | null> {
  if (typeof pedidoId !== "string" || !/^order_[A-Za-z0-9]+$/.test(pedidoId)) return null
  if (!(await ehDeQuemComprou(pedidoId))) return null
  return situacaoDoPedido(pedidoId)
}
