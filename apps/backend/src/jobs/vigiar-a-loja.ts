import type { MedusaContainer } from "@medusajs/framework/types"
import { comRodada } from "../lib/observabilidade/rodada"
import { vigiar } from "../lib/observabilidade/vigia"

/**
 * De 5 em 5 minutos: a tela de Observabilidade em dia, mesmo sem ninguém
 * olhando (`lib/observabilidade/vigia.ts`) — o problema novo entra, o
 * resolvido sai sozinho, e o número vermelho do menu do painel acompanha.
 *
 * Nos minutos 1, 6, 11…: logo depois da conciliação (0, 5, 10…), que é quem
 * mais muda o que ele lê.
 */
async function vigiarALoja(container: MedusaContainer) {
  await vigiar(container)
}

export const config = {
  name: "vigiar-a-loja",
  schedule: "1-59/5 * * * *",
}

export default comRodada(config.name, vigiarALoja)
