import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"

/**
 * "MARCAR COMO RESOLVIDO" — o problema de evento vira resolvido, com quem
 * marcou e quando. Quem chama é `POST /dashboard/observabilidade/problemas/:id`,
 * depois de conferir que o papel vê o problema e que ele não sai sozinho. Se
 * algo falhar depois, o problema volta a ficar aberto.
 */

type Entrada = { id: string; membroId: string; nome: string }

const marcarResolvidoStep = createStep(
  "marcar-resolvido",
  async ({ id, membroId, nome }: Entrada, { container }) => {
    const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
    const [feito] = await obs.updateProblemas([
      {
        id,
        situacao: "resolvido",
        resolvido_em: new Date(),
        resolvido_por: membroId,
        resolvido_nome: nome,
      },
    ])
    return new StepResponse(feito, id)
  },
  async (id, { container }) => {
    if (!id) return
    await container.resolve<ObservabilidadeService>(OBSERVABILIDADE).updateProblemas([
      {
        id,
        situacao: "aberto",
        resolvido_em: null,
        resolvido_por: null,
        resolvido_nome: null,
      },
    ])
  }
)

export const resolverProblemaWorkflow = createWorkflow("resolver-problema", (entrada: Entrada) => {
  const feito = marcarResolvidoStep(entrada)
  return new WorkflowResponse(feito)
})
