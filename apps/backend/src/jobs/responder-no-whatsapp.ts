import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { comRodada } from "../lib/observabilidade/rodada"
import { rodadaDoWhatsapp } from "../lib/whatsapp/responder"

/**
 * DE MINUTO EM MINUTO, no worker: o atendente do WhatsApp responde quem
 * escreveu pro número da loja (`lib/whatsapp/responder.ts`). Uma rodada por
 * vez (a trava): duas juntas responderiam a mesma pessoa duas vezes.
 *
 * Sem ninguém esperando resposta, a rodada só olha a fila e sai — não chama
 * a IA nem a Meta.
 */
async function responderNoWhatsapp(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container
    .resolve(Modules.LOCKING)
    .execute("responder-no-whatsapp", () => rodadaDoWhatsapp(container), { timeout: 55 })
  if (r.falta.length)
    logger.warn(`[whatsapp] tem gente esperando resposta e falta no Railway: ${r.falta.join(", ")}`)
  if (r.respondidas || r.praEquipe || r.falhas)
    logger.info(
      `[whatsapp] ${r.respondidas} respondida(s), ${r.praEquipe} pra equipe, ` +
        `${r.largadas} largada(s), ${r.esperando} esperando, ${r.falhas} falha(s)`
    )
}

export const config = {
  name: "responder-no-whatsapp",
  schedule: "* * * * *",
}

export default comRodada(config.name, responderNoWhatsapp)
