import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { rodarAsCampanhas } from "../lib/crm/enviar-campanhas"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * A cada 5 minutos, no worker: as campanhas do CRM (entrega 0206,
 * `lib/crm/enviar-campanhas.ts`) — a agendada que chegou na hora começa, e a
 * que está saindo manda mais um lote, e o resultado da que fechou os 7 dias
 * fica guardado. Nos minutos 0 e 5 de cada dezena: a
 * rodada (uns 100 e-mails, um por segundo) acaba antes da dos fluxos, no 3 e
 * no 8. Uma rodada por vez (a trava).
 */
async function campanhasDoCrm(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container
    .resolve(Modules.LOCKING)
    .execute("campanhas-do-crm", () => rodarAsCampanhas(container), { timeout: 240 })
  if (r.fechou) logger.info(`[crm] campanha ${r.fechou}: o resultado de 7 dias ficou guardado`)
  if (r.enviados || r.falhas || r.controle || r.acabou)
    logger.info(
      `[crm] campanha ${r.campanha}: ${r.enviados} e-mail(s), ${r.controle} no controle, ` +
        `${r.teto} no teto, ${r.falhas} falha(s), ${r.restam} faltando${r.acabou ? " — acabou" : ""}`
    )
}

export const config = {
  name: "campanhas-do-crm",
  schedule: "*/5 * * * *",
}

export default comRodada(config.name, campanhasDoCrm)
