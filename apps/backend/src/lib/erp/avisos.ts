import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail, type Email } from "../email"

/**
 * O E-MAIL PRA EQUIPE — um pra cada usuário do admin, como o do estorno que
 * falhou (`lib/estornos.ts`): quem resolve é quem entra no painel do ERP.
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
  const usuarios = await container
    .resolve(Modules.USER)
    .listUsers({}, { select: ["email"], take: 20 })
    .catch(() => [])
  const emails = [...new Set(usuarios.map((u) => u.email).filter(Boolean))] as string[]
  if (!emails.length) {
    logger.warn(`[erp] nenhum usuário no admin pra avisar por e-mail (${chave})`)
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
