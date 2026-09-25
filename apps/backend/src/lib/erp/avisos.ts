import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail, type Email } from "../email"
import { emailsPraAvisar } from "../equipe/avisados"

/**
 * O E-MAIL PRA EQUIPE — um pra cada pessoa do papel que resolve
 * (`lib/equipe/avisados.ts`): a conexão caída (`erp-caiu/…`) vai pro dono; a
 * nota (`nota-…`), pra operação e pro dono.
 *
 * `chave` vira a idempotência do Resend (com o destinatário no fim): o mesmo
 * aviso, disparado duas vezes no mesmo dia pelo evento e pela varredura,
 * sai uma vez. Devolve se saiu pra pelo menos um.
 */
export async function avisarAEquipe(
  container: MedusaContainer,
  montar: (para: string) => Email,
  chave: string
): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const emails = await emailsPraAvisar(
    container,
    chave.startsWith("erp-caiu/") ? ["dono"] : ["operacao", "dono"]
  )
  if (!emails.length) {
    logger.warn(`[erp] ninguém na equipe nem no admin pra avisar por e-mail (${chave})`)
    return false
  }
  let saiu = false
  for (const para of emails) {
    const r = await enviarEmail(montar(para), logger, {
      idempotencia: `${chave}/${para}`.slice(0, 256),
    })
    if (r.ok) {
      saiu = true
      logger.info(`[erp] aviso ${chave.split("/")[0]} pra ${emailNoLog(para)}`)
    }
  }
  return saiu
}
