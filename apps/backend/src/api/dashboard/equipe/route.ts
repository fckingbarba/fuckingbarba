import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../../../lib/email"
import { emailDoConvite } from "../../../lib/emails/convite"
import { exigirArea, TRAVA_DA_EQUIPE, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ACESSO, emOrdem, lerConvite, membroPublico } from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { convidarMembroWorkflow } from "../../../workflows/equipe/convidar"

/**
 * GET /dashboard/equipe — a equipe do painel, pra tela "Equipe e acessos".
 * Só o dono. Quem foi removido não aparece: pra voltar, é convidar de novo.
 *
 * Vai junto a tabela de quem abre o quê (`ACESSO`): a tela desenha a
 * matriz dos papéis com ela, e não com uma cópia que um dia discordaria.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const membros = await equipe.listMembros({ situacao: ["ativo", "convidado"] })
  res.json({ membros: emOrdem(membros).map(membroPublico), eu: pedido.membro.id, acesso: ACESSO })
}

/**
 * POST /dashboard/equipe — convida alguém: `{ nome, email, papel }`. Só o dono.
 *
 * O convite fica gravado mesmo se o e-mail não sair (`email_enviado: false`):
 * a tela avisa, e o "reenviar" da pessoa manda de novo.
 *
 * RESPOSTAS: 200 `{ membro, email_enviado }`; 400 `nome_invalido`,
 * `email_invalido` ou `papel_invalido`; 409 `ja_na_equipe`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const leitura = lerConvite(req.body)
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo })
    return
  }
  const { nome, email, papel } = leitura.convite
  const trava = req.scope.resolve(Modules.LOCKING)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  let membro
  try {
    membro = await trava.execute(
      TRAVA_DA_EQUIPE,
      async () => {
        const { result } = await convidarMembroWorkflow(req.scope).run({
          input: { quemId: pedido.membro.id, nome, email, papel },
        })
        return result
      },
      { timeout: 5 }
    )
  } catch (e) {
    if ((e as { type?: string })?.type === MedusaError.Types.DUPLICATE_ERROR) {
      res.status(409).json({ message: "ja_na_equipe" })
      return
    }
    throw e
  }

  const enviado = await enviarEmail(
    emailDoConvite({ para: email, nome, papel, quem: pedido.membro.nome }),
    logger
  )
  if (!enviado.ok)
    logger.warn(`[painel] convite de ${emailNoLog(email)} não saiu: ${enviado.motivo}`)

  res.json({ membro: membroPublico(membro), email_enviado: enviado.ok })
}
