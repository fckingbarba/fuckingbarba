import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { assinaturaConfere, lerAvisoDoResend } from "../../../lib/crm/resend"
import { dominioDe } from "../../../lib/observabilidade/telemetria"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"

/**
 * POST /hooks/resend — o aviso do Resend sobre um e-mail que a loja mandou:
 * chegou, atrasou, foi aberto, levou clique, voltou, virou reclamação de
 * spam (`lib/crm/resend.ts`). Vai pra linha do e-mail, no CRM.
 *
 * ┌─ SÓ COM A ASSINATURA DO RESEND ────────────────────────────────────────┐
 * │ O endereço é público. O Resend assina cada aviso (o padrão Svix) com o │
 * │ segredo do webhook, que vive no Railway (`RESEND_WEBHOOK_SEGREDO`, o   │
 * │ `whsec_…` da tela do webhook no Resend) — e a conta é sobre o corpo    │
 * │ CRU, byte por byte (`preserveRawBody`, no `middlewares.ts`). Sem o     │
 * │ segredo, ou sem a assinatura certa, 401 e nada gravado.                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O e-mail que foi pra alguém da equipe do painel (a venda nova, o código do
 * painel) é marcado como da equipe: fica fora das contas do CRM.
 *
 * Responde rápido: o Resend espera alguns segundos e tenta de novo depois —
 * por isso o aviso repetido não pode mudar nada (as horas de primeira e de
 * última vez, no serviço). 200 também pro aviso que o CRM não usa.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const segredo = process.env.RESEND_WEBHOOK_SEGREDO
  const corpo = req.rawBody ? String(req.rawBody) : ""
  const confere = assinaturaConfere({
    id: req.headers["svix-id"],
    timestamp: req.headers["svix-timestamp"],
    assinaturas: req.headers["svix-signature"],
    corpo,
    segredo,
  })
  if (!confere) {
    logger.warn(
      segredo
        ? "[resend] aviso recusado: a assinatura não confere"
        : "[resend] aviso recusado: falta o RESEND_WEBHOOK_SEGREDO no Railway"
    )
    res.status(401).json({ message: "nao_autorizado" })
    return
  }

  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    res.status(400).json({ message: "aviso_ilegivel" })
    return
  }
  const aviso = lerAvisoDoResend(json, dominioDe(process.env.LOJA_URL))
  if (!aviso) {
    res.json({ ok: true })
    return
  }

  try {
    const equipe = aviso.para ? await ehDaEquipe(req, aviso.para) : false
    await req.scope.resolve<CrmService>(CRM).anotarAvisoDoEmail(aviso, equipe)
  } catch (e) {
    // O Resend tenta de novo quando a resposta não é 2xx: o banco fora volta.
    logger.warn(`[resend] não anotei o aviso: ${e instanceof Error ? e.message : e}`)
    res.status(503).json({ message: "tente_de_novo" })
    return
  }
  res.json({ ok: true })
}

/** Alguém da equipe do painel (qualquer situação), ou do admin do Medusa. */
async function ehDaEquipe(req: MedusaRequest, email: string): Promise<boolean> {
  const [membros, usuarios] = await Promise.all([
    req.scope
      .resolve<EquipeService>(EQUIPE)
      .listMembros({ email }, { select: ["id"], take: 1 })
      .catch(() => []),
    req.scope
      .resolve(Modules.USER)
      .listUsers({ email }, { select: ["id"], take: 1 })
      .catch(() => []),
  ])
  return membros.length > 0 || usuarios.length > 0
}
