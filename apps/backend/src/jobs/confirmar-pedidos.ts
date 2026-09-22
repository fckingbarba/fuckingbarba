import type { MedusaContainer } from "@medusajs/framework/types"
import { confirmarPedidosPagos } from "../lib/confirmar-pedido"

/**
 * De 5 em 5 minutos, no worker: todo pedido pago nas últimas 24 horas
 * recebe o e-mail de confirmação, uma vez.
 *
 * O evento `payment.captured` já manda quase todos na hora; esta é a rede
 * embaixo dele — o "Check status" do admin (que captura sem evento), o
 * e-mail que o Resend recusou por um instante, o evento que se perdeu. O
 * porquê de cada caso está em `src/lib/confirmar-pedido.ts`.
 *
 * Nos minutos 2, 7, 12… e não junto com a conciliação (0, 5, 10…): ela pode
 * registrar um Pix pago bem nessa hora, e aí o evento dela já resolve.
 */
export default async function confirmarPedidos(container: MedusaContainer) {
  await confirmarPedidosPagos(container)
}

export const config = {
  name: "confirmar-pedidos",
  schedule: "2-59/5 * * * *",
}
