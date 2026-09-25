import type { MedusaContainer } from "@medusajs/framework/types"
import { avisarCancelamentosRecentes } from "../lib/avisar-cancelamento"
import { confirmarPedidosPagos } from "../lib/confirmar-pedido"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 5 em 5 minutos, no worker: todo pedido pago nas últimas 24 horas recebe
 * o e-mail de confirmação, e todo pedido cancelado nas últimas 24 horas
 * recebe o aviso de cancelamento — um de cada, por pedido.
 *
 * Os eventos `payment.captured` e `order.canceled` já mandam quase todos na
 * hora; esta é a rede embaixo deles — o "Check status" do admin (que captura
 * sem evento), o e-mail que o Resend recusou por um instante, o evento que
 * se perdeu. O porquê de cada caso está em `src/lib/confirmar-pedido.ts` e em
 * `src/lib/avisar-cancelamento.ts`.
 *
 * Nos minutos 2, 7, 12… e não junto com a conciliação (0, 5, 10…): ela pode
 * registrar um Pix pago — ou cancelar um Pix vencido — bem nessa hora, e aí
 * o evento dela já resolve.
 */
async function confirmarPedidos(container: MedusaContainer) {
  await confirmarPedidosPagos(container)
  await avisarCancelamentosRecentes(container)
}

export const config = {
  name: "confirmar-pedidos",
  schedule: "2-59/5 * * * *",
}

export default comRodada(config.name, confirmarPedidos)
