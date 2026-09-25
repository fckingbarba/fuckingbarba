import type { MedusaContainer } from "@medusajs/framework/types"
import { mandarComprasPendentes } from "../lib/anuncios/enviar"
import { avisarCancelamentosRecentes } from "../lib/avisar-cancelamento"
import { avisarDevolucoesRecentes } from "../lib/avisar-devolucao"
import { confirmarPedidosPagos } from "../lib/confirmar-pedido"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 5 em 5 minutos, no worker: todo pedido pago nas últimas 24 horas recebe
 * o e-mail de confirmação, e todo pedido cancelado nas últimas 24 horas
 * recebe o aviso de cancelamento — um de cada, por pedido. E o pagamento que
 * entrou num pedido já cancelado, e voltou, é avisado (olhando 7 dias). E a
 * compra que ficou devendo à Meta, ao GA4 ou ao TikTok sai (`lib/anuncios/`).
 *
 * Os eventos `payment.captured` e `order.canceled` já mandam quase todos na
 * hora (e a conciliação, o da devolução, logo depois de devolver); esta é a
 * rede embaixo deles — o "Check status" do admin (que captura sem evento), o
 * e-mail que o Resend recusou por um instante, o evento que se perdeu. O
 * porquê de cada caso está em `src/lib/confirmar-pedido.ts`,
 * `src/lib/avisar-cancelamento.ts` e `src/lib/avisar-devolucao.ts`.
 *
 * Nos minutos 2, 7, 12… e não junto com a conciliação (0, 5, 10…): ela pode
 * registrar um Pix pago — ou cancelar um Pix vencido — bem nessa hora, e aí
 * o evento dela já resolve.
 */
async function confirmarPedidos(container: MedusaContainer) {
  await confirmarPedidosPagos(container)
  await avisarCancelamentosRecentes(container)
  await avisarDevolucoesRecentes(container)
  await mandarComprasPendentes(container)
}

export const config = {
  name: "confirmar-pedidos",
  schedule: "2-59/5 * * * *",
}

export default comRodada(config.name, confirmarPedidos)
