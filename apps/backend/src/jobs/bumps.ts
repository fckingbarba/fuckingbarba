import type { MedusaContainer } from "@medusajs/framework/types"
import { sincronizarBumps } from "../lib/bumps"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * DE HORA EM HORA, todo produto publicado tem a promoção da oferta do
 * checkout (`lib/bumps.ts`). Produto novo entra na próxima rodada; rodada sem
 * mudança não escreve nada.
 *
 * O minuto 23 é pra não cair junto dos outros jobs.
 */
async function bumps(container: MedusaContainer) {
  await sincronizarBumps(container)
}

export const config = {
  name: "bumps",
  schedule: "23 * * * *",
}

export default comRodada(config.name, bumps)
