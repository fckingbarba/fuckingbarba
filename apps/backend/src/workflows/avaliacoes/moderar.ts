import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"

/**
 * APROVAR OU RECUSAR uma avaliação — a situação nova, com quem mexeu e
 * quando. Quem chama é o `moderarAvaliacao` (`lib/avaliacoes/moderar.ts`),
 * pelo painel ou pelo admin. Se algo falhar depois, ela volta a ser o que
 * era.
 */

type Situacao = "nova" | "aprovada" | "recusada"

type Entrada = {
  id: string
  situacao: Exclude<Situacao, "nova">
  /** O membro da equipe (`eqp_…`), ou null quando foi pelo admin do Medusa. */
  quem: string | null
  antes: { situacao: Situacao; moderada_em: Date | null; moderada_por: string | null }
}

const mudarSituacaoDaAvaliacaoStep = createStep(
  "mudar-situacao-da-avaliacao",
  async ({ id, situacao, quem, antes }: Entrada, { container }) => {
    await container
      .resolve<AvaliacoesService>(AVALIACOES)
      .updateAvaliacoes([{ id, situacao, moderada_em: new Date(), moderada_por: quem }])
    return new StepResponse({ id, situacao }, { id, antes })
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    await container
      .resolve<AvaliacoesService>(AVALIACOES)
      .updateAvaliacoes([{ id: desfazer.id, ...desfazer.antes }])
  }
)

export const moderarAvaliacaoWorkflow = createWorkflow(
  "moderar-avaliacao",
  (entrada: Entrada) => new WorkflowResponse(mudarSituacaoDaAvaliacaoStep(entrada))
)
