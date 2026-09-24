import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * QUEM ACABOU DE PROVAR O E-MAIL ENTRA NO PAINEL.
 *
 * Na primeira vez, a identidade do código (`codigo-equipe`) é ligada ao
 * membro — o `equipe_id` vai pro `app_metadata`, pelo passo do próprio
 * Medusa, e é dele que o token passa a tirar o `actor_id`. O convidado vira
 * `ativo`. Nas vezes seguintes, só a hora do último acesso muda e o registro
 * ganha a linha "entrou".
 */

type Entrada = { authIdentityId: string; membroId: string; primeira: boolean }

const marcarEntradaStep = createStep(
  "marcar-entrada",
  async ({ membroId }: Entrada, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const antes = await equipe.retrieveMembros(membroId)
    const agora = new Date()
    const membro = await equipe.updateMembros({
      id: membroId,
      situacao: "ativo",
      entrou_em: antes.entrou_em ?? agora,
      ultimo_acesso: agora,
    })
    return new StepResponse(membro, {
      id: membroId,
      situacao: antes.situacao,
      entrou_em: antes.entrou_em,
      ultimo_acesso: antes.ultimo_acesso,
    })
  },
  async (volta, { container }) => {
    if (!volta) return
    const { id, ...resto } = volta
    await container.resolve<EquipeService>(EQUIPE).updateMembros({ id, ...resto })
  }
)

export const vincularMembroWorkflow = createWorkflow("vincular-membro", (entrada: Entrada) => {
  when({ entrada }, ({ entrada }) => entrada.primeira).then(() => {
    setAuthAppMetadataStep({
      authIdentityId: entrada.authIdentityId,
      actorType: "equipe",
      value: entrada.membroId,
    })
  })
  const membro = marcarEntradaStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada }, ({ entrada }) => ({
      membro_id: entrada.membroId,
      acao: entrada.primeira ? "entrou_pela_primeira_vez" : "entrou",
    }))
  )
  return new WorkflowResponse(membro)
})
