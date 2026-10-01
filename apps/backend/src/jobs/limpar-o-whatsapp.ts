import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { comRodada } from "../lib/observabilidade/rodada"
import { WHATSAPP } from "../modules/whatsapp"
import type WhatsappService from "../modules/whatsapp/service"

/**
 * O PRAZO DO WHATSAPP — cada mensagem fica 12 meses (365 dias, o que a
 * política de privacidade promete) e depois sai do banco de verdade; a
 * conversa sai junto com a última mensagem dela. O atendente só lê os
 * últimos 30 dias (`DIAS_LIDOS`): o resto fica pra equipe, no painel.
 *
 * De hora em hora, como o `limpar-o-crm`: cada rodada só apaga a hora que
 * venceu. O minuto 53 é pra não cair junto dos outros jobs de hora em hora.
 */
export const DIAS_DO_WHATSAPP = 365
const DIA_MS = 24 * 60 * 60 * 1000

async function limparOWhatsapp(container: MedusaContainer) {
  const antes = new Date(Date.now() - DIAS_DO_WHATSAPP * DIA_MS)
  const { mensagens, conversas } = await container.resolve<WhatsappService>(WHATSAPP).limpar(antes)
  if (mensagens || conversas)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`[whatsapp] prazo de 12 meses: saíram ${mensagens} mensagens e ${conversas} conversas`)
}

export const config = {
  name: "limpar-o-whatsapp",
  schedule: "53 * * * *",
}

export default comRodada(config.name, limparOWhatsapp)
