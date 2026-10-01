import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoWhatsappPraEquipe } from "../emails/whatsapp-equipe"
import { emailsPraAvisar } from "../equipe/avisados"

/**
 * O E-MAIL DA EQUIPE quando o atendente passa uma conversa pra ela — pra
 * operação e pro dono (`AVISOS_DA_EQUIPE`). Um por passagem: a chave do
 * Resend leva a conversa e a hora da passagem, e a mesma passagem nunca vira
 * dois e-mails.
 *
 * NUNCA DERRUBA A RESPOSTA: o aviso que não saiu fica no log, e a conversa
 * aparece do mesmo jeito no painel, com o número no menu.
 */
export async function avisarAEquipe(
  container: MedusaContainer,
  p: {
    conversa: string
    nome: string | null
    telefone: string
    motivo: string
    ultima: string | null
    em: Date
  }
): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  try {
    const emails = await emailsPraAvisar(container, ["operacao", "dono"])
    if (!emails.length) return
    const quem = p.nome?.trim().split(/\s+/)[0] || `o número que termina em ${p.telefone.slice(-4)}`
    const ultima = p.ultima
      ? p.ultima.length > 200
        ? `${p.ultima.slice(0, 199)}…`
        : p.ultima
      : null
    for (const para of emails) {
      const r = await enviarEmail(
        emailDoWhatsappPraEquipe(para, { quem, motivo: p.motivo, ultima, conversa: p.conversa }),
        logger,
        {
          idempotencia: `whatsapp-equipe/${p.conversa}/${p.em.toISOString()}/${para}`.slice(0, 256),
        }
      )
      if (r.ok) logger.info(`[whatsapp] avisei ${emailNoLog(para)} da conversa que foi pra equipe`)
    }
  } catch (e) {
    logger.warn(`[whatsapp] o aviso da equipe não saiu: ${e instanceof Error ? e.message : e}`)
  }
}
