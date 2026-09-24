import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { TRAVA_DA_EQUIPE } from "../../../lib/equipe/acesso"
import { areasDo, membroPublico, podeEntrar } from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { vincularMembroWorkflow } from "../../../workflows/equipe/vincular"

/**
 * POST /dashboard/vincular — quem acabou de confirmar o código entra no
 * painel. O painel chama isto a cada entrada, logo depois do
 * `POST /auth/equipe/codigo-equipe`, e então `POST /auth/token/refresh` pra
 * ter o token com o membro dentro.
 *
 * Na primeira vez, liga a identidade ao membro e o convidado vira ativo; nas
 * outras, anota a entrada (`workflows/equipe/vincular.ts`). E confere de
 * novo se a pessoa pode entrar: entre o código sair e voltar, o dono pode
 * ter tirado ela da equipe.
 *
 * Só aceita identidade do provedor `codigo-equipe` — a conta de cliente do
 * mesmo e-mail é outra identidade, e não abre o painel.
 *
 * RESPOSTAS: 200 `{ membro, areas }`; 401 `fora_da_equipe`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const auth = req.scope.resolve(Modules.AUTH)
  const trava = req.scope.resolve(Modules.LOCKING)
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)

  const identidade = await auth.retrieveAuthIdentity(req.auth_context.auth_identity_id, {
    relations: ["provider_identities"],
  })
  const doCodigo = identidade.provider_identities?.find((p) => p.provider === "codigo-equipe")
  if (!doCodigo) {
    res.status(401).json({ message: "fora_da_equipe" })
    return
  }
  const email = doCodigo.entity_id

  const membro = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      const [atual] = await equipe.listMembros({ email })
      if (!atual || !podeEntrar(atual)) return null

      // Relida dentro da trava: quem esperou a vez pode achar tudo pronto.
      const agora = await auth.retrieveAuthIdentity(identidade.id)
      const ligado = agora.app_metadata?.equipe_id
      if (ligado && ligado !== atual.id) return null

      const { result } = await vincularMembroWorkflow(req.scope).run({
        input: { authIdentityId: identidade.id, membroId: atual.id, primeira: !ligado },
      })
      return result
    },
    { timeout: 5 }
  )

  if (!membro) {
    res.status(401).json({ message: "fora_da_equipe" })
    return
  }
  res.json({ membro: membroPublico(membro), areas: areasDo(membro.papel) })
}
