import type { MedusaContainer } from "@medusajs/framework/types"
import { pedirAvaliacoes } from "../lib/avaliacoes/pedir"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De hora em hora, no worker: o e-mail "o que você achou?" pra quem recebeu
 * o pedido há um dia (`lib/avaliacoes/pedir.ts`). Fora das 9h–21h de
 * Brasília, a rodada não manda nada — o e-mail da entrega das 23h sai às 9h.
 */
async function pedirAvaliacoesDoDia(container: MedusaContainer) {
  await pedirAvaliacoes(container)
}

export const config = {
  name: "pedir-avaliacoes",
  schedule: "37 * * * *",
}

export default comRodada(config.name, pedirAvaliacoesDoDia)
