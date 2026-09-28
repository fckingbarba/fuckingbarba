import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CRIADORES } from "../../modules/criadores"
import type CriadoresService from "../../modules/criadores/service"

/**
 * APROVAR OU RECUSAR uma inscrição de criador — a situação nova, com quem
 * decidiu e quando. Quem chama é o `decidirInscricao`
 * (`lib/criadores/decidir.ts`), pelo painel. Se algo falhar depois, ela
 * volta a ser o que era.
 */

type Situacao = "nova" | "aprovada" | "recusada"

type Entrada = {
  id: string
  situacao: Exclude<Situacao, "nova">
  /** O membro da equipe (`eqp_…`). */
  quem: string | null
  antes: { situacao: Situacao; decidida_em: Date | null; decidida_por: string | null }
}

const mudarSituacaoDaInscricaoStep = createStep(
  "mudar-situacao-da-inscricao",
  async ({ id, situacao, quem, antes }: Entrada, { container }) => {
    await container
      .resolve<CriadoresService>(CRIADORES)
      .updateInscricoes([{ id, situacao, decidida_em: new Date(), decidida_por: quem }])
    return new StepResponse({ id, situacao }, { id, antes })
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    await container
      .resolve<CriadoresService>(CRIADORES)
      .updateInscricoes([{ id: desfazer.id, ...desfazer.antes }])
  }
)

export const decidirInscricaoDeCriadorWorkflow = createWorkflow(
  "decidir-inscricao-de-criador",
  (entrada: Entrada) => new WorkflowResponse(mudarSituacaoDaInscricaoStep(entrada))
)
