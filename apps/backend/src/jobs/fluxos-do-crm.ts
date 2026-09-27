import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { rodarOsFluxos } from "../lib/crm/motor"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * A cada 5 minutos, no worker: os fluxos do CRM (`lib/crm/motor.ts`) — o
 * checkout abandonado e o Pix pendente. Uma rodada por vez (a trava): duas
 * juntas nunca mandam o mesmo e-mail, mas a segunda nem precisa olhar.
 */
async function fluxosDoCrm(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container
    .resolve(Modules.LOCKING)
    .execute("fluxos-do-crm", () => rodarOsFluxos(container), { timeout: 240 })
  if (r.ligouAgora.length)
    logger.info(`[crm] fluxos ligados a partir de agora: ${r.ligouAgora.join(", ")}`)
  if (r.enviados || r.falhas || r.controle)
    logger.info(
      `[crm] fluxos: ${r.enviados} e-mail(s), ${r.cupons} cupom(ns), ${r.controle} no controle, ` +
        `${r.pulados} pulado(s), ${r.teto} no teto, ${r.fora} de fora, ${r.falhas} falha(s)`
    )
}

export const config = {
  name: "fluxos-do-crm",
  schedule: "3-59/5 * * * *",
}

export default comRodada(config.name, fluxosDoCrm)
