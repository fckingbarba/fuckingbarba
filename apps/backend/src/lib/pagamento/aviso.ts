import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoParceiro, type AvisoDoParceiro } from "../emails/parceiro-fora"
import { emailsPraAvisar } from "../equipe/avisados"
import { saudeDoParceiro, virada, type Terminada } from "./disjuntor"
import { parceiroDe, PARCEIROS } from "./parceiros"

/**
 * DEPOIS DE CADA TENTATIVA, O DISJUNTOR — chamado pela porta do `complete`
 * (`lib/cartao/porta.ts`) com as tentativas terminadas lidas ANTES de fechar
 * esta. Compara a saúde do parceiro antes e depois dela
 * (`lib/pagamento/disjuntor.ts`): se virou — caiu ou voltou —, o log diz, e a
 * equipe (o dono) recebe um e-mail.
 *
 * UM DE CADA POR HORA, por parceiro: a chave do Resend leva a hora. Duas
 * tentativas que terminam juntas e viram o parceiro ao mesmo tempo, ou o
 * parceiro que cai, volta e cai de novo na mesma hora, não viram dois
 * e-mails iguais.
 *
 * Nunca lança pra porta: quem chama já respondeu a compra.
 */
export async function conferirOParceiro(
  container: MedusaContainer,
  provedor: string,
  antes: readonly Terminada[],
  agora = new Date()
): Promise<void> {
  const parceiro = parceiroDe(provedor)
  if (!parceiro) return
  const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const depois = await obs.terminadasDosParceiros()
  const saude = saudeDoParceiro(provedor, depois, agora)
  const mudou = virada(saudeDoParceiro(provedor, antes, agora), saude)
  if (!mudou) return

  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  if (mudou.tipo === "caiu") {
    logger.warn(
      `[pagamento] DISJUNTOR: o ${parceiro.nome} não atendeu ${saude.seguidas} tentativas ` +
        `seguidas — fora do caminho até ${saude.foraAte?.toISOString() ?? "a próxima"}.`
    )
  } else {
    logger.info(
      `[pagamento] o ${parceiro.nome} voltou (em queda desde ${mudou.desde.toISOString()})`
    )
  }

  const ligados = await parceirosLigados(container)
  const primeiroNoPix = PARCEIROS.find((p) => ligados.has(p.id) && p.formas.includes("pix"))
  const aviso: AvisoDoParceiro = {
    parceiro: { nome: parceiro.nome, formas: parceiro.formas },
    reserva: Boolean(primeiroNoPix) && primeiroNoPix!.id !== provedor,
    tipo: mudou.tipo,
    desde: mudou.tipo === "caiu" ? (saude.emQuedaDesde ?? agora) : mudou.desde,
    outros: PARCEIROS.filter((p) => p.id !== provedor && ligados.has(p.id)).map((p) => ({
      nome: p.nome,
      formas: p.formas,
      emQueda: saudeDoParceiro(p.id, depois, agora).emQuedaDesde !== null,
    })),
  }

  const emails = await emailsPraAvisar(container, ["dono"])
  if (!emails.length) {
    logger.warn("[pagamento] o disjuntor virou, e não há ninguém na equipe nem no admin pra avisar")
    return
  }
  const hora = agora.toISOString().slice(0, 13)
  for (const para of emails) {
    const r = await enviarEmail(emailDoParceiro(para, aviso, agora), logger, {
      idempotencia: `parceiro-${mudou.tipo}/${parceiro.chave}/${hora}/${para}`.slice(0, 256),
    })
    if (r.ok)
      logger.info(`[pagamento] avisei ${emailNoLog(para)}: o ${parceiro.nome} ${mudou.tipo}`)
  }
}

/**
 * Os parceiros ligados em alguma região — é isso que diz se a loja tem pra
 * onde mandar o Pix (o `npm run backend:pagamento` liga o Mercado Pago só
 * com o token dele).
 */
async function parceirosLigados(container: MedusaContainer): Promise<Set<string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "region",
    fields: ["id", "payment_providers.id", "payment_providers.is_enabled"],
  })
  const ids = new Set<string>()
  for (const r of data as {
    payment_providers?: ({ id?: string; is_enabled?: boolean } | null)[] | null
  }[]) {
    for (const p of r.payment_providers ?? []) {
      if (p?.id && p.is_enabled !== false) ids.add(p.id)
    }
  }
  return ids
}
