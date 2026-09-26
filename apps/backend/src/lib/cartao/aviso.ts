import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoRoboNoCartao } from "../emails/robo-no-cartao"
import { emailsPraAvisar } from "../equipe/avisados"
import type { Contagem } from "./robo"

/**
 * O FREIO LIGOU — um e-mail pra cada dono do painel (sem ninguém no painel,
 * pros usuários do admin: `lib/equipe/avisados.ts`), como o do estorno que
 * não saiu.
 *
 * UM POR HORA, no máximo: a chave do Resend leva a hora. Duas recusas que
 * ligam o freio juntas, ou o freio que desliga e liga de novo na mesma
 * hora, não viram dois e-mails.
 */
export async function avisarDoFreio(
  container: MedusaContainer,
  { recusas, terminadas }: Pick<Contagem, "recusas" | "terminadas">,
  agora = new Date()
): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const emails = await emailsPraAvisar(container, ["dono"])
  if (!emails.length) {
    logger.warn("[cartão] o freio ligou, e não há ninguém na equipe nem no admin pra avisar")
    return
  }
  const hora = agora.toISOString().slice(0, 13)
  for (const para of emails) {
    const r = await enviarEmail(emailDoRoboNoCartao(para, { recusas, terminadas }), logger, {
      idempotencia: `robo-no-cartao/${hora}/${para}`.slice(0, 256),
    })
    if (r.ok) logger.info(`[cartão] avisei ${emailNoLog(para)} do freio`)
  }
}
