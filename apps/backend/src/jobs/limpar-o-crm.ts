import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { comRodada } from "../lib/observabilidade/rodada"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"

/**
 * O PRAZO DO CRM — o que a loja anotou de cada pessoa fica 13 meses (400
 * dias, o que a política de privacidade promete), e depois sai do banco de
 * verdade. O visitante que não aparece desde então sai junto, e o e-mail
 * que saiu antes disso (com os avisos do Resend dele) também.
 *
 * De hora em hora, e não uma vez por dia: cada rodada só apaga a hora que
 * venceu, rápida — e a tela de Observabilidade só entende agenda de minutos
 * (`lib/painel/observabilidade.ts`). O minuto 41 é pra não cair junto dos
 * outros jobs.
 */
export const DIAS_DO_CRM = 400
const DIA_MS = 24 * 60 * 60 * 1000

async function limparOCrm(container: MedusaContainer) {
  const antes = new Date(Date.now() - DIAS_DO_CRM * DIA_MS)
  const { eventos, visitantes, emails } = await container.resolve<CrmService>(CRM).limpar(antes)
  if (eventos || visitantes || emails)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(
        `[crm] prazo de 13 meses: saíram ${eventos} anotações, ${visitantes} visitantes e ` +
          `${emails} e-mails`
      )
}

export const config = {
  name: "limpar-o-crm",
  schedule: "41 * * * *",
}

export default comRodada(config.name, limparOCrm)
