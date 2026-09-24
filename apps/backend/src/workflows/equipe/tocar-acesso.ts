import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"

/**
 * A HORA DO ÚLTIMO ACESSO — o que a tela da equipe mostra de cada um.
 *
 * O token dura 30 dias, então a hora de entrar diria pouco: quem usa o
 * painel todo dia entrou uma vez só no mês. Quem chama é `GET /dashboard/eu`
 * (o painel pergunta em toda página), no máximo uma vez por hora — sem
 * linha no registro, que é pra mudança, não pra visita.
 */

const gravarUltimoAcessoStep = createStep(
  "gravar-ultimo-acesso",
  async ({ id }: { id: string }, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const antes = await equipe.retrieveMembros(id)
    await equipe.updateMembros({ id, ultimo_acesso: new Date() })
    return new StepResponse(undefined, { id, ultimo_acesso: antes.ultimo_acesso })
  },
  async (volta, { container }) => {
    if (!volta) return
    await container.resolve<EquipeService>(EQUIPE).updateMembros(volta)
  }
)

export const tocarAcessoWorkflow = createWorkflow("tocar-acesso", (entrada: { id: string }) => {
  gravarUltimoAcessoStep(entrada)
  return new WorkflowResponse(undefined)
})
