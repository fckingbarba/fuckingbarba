import type { MedusaContainer } from "@medusajs/framework/types"
import { registrarPendentes } from "../lib/envios/registro"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 10 em 10 minutos, no worker: o pedido pago que ainda não entrou no
 * painel do parceiro entra (`lib/envios/registro.ts`).
 *
 * O `payment.captured` já manda quase todos na hora; esta é a rede embaixo
 * dele — a Frenet fora do ar naquele instante, o "Check status" do admin
 * (que captura sem evento), o evento que se perdeu.
 *
 * Sem o token de parceiro da Frenet, volta na primeira linha: nenhuma
 * consulta ao banco, nenhuma chamada.
 *
 * Nos minutos 6, 16, 26… — longe dos 2, 7, 12… da confirmação e dos 0, 5,
 * 10… da conciliação: o pedido que elas acabaram de resolver chega aqui
 * com o pagamento já registrado.
 */
async function registrarPedidos(container: MedusaContainer) {
  await registrarPendentes(container)
}

export const config = {
  name: "registrar-pedidos",
  schedule: "6-59/10 * * * *",
}

export default comRodada(config.name, registrarPedidos)
