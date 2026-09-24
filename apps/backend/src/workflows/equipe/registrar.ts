import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"

/**
 * UMA LINHA NO REGISTRO DE QUEM FEZ O QUÊ — o passo que todo workflow da
 * equipe termina chamando. Se um passo depois dele falhar, a linha some
 * junto: o registro conta o que aconteceu, não o que se tentou.
 */
export type Anotacao = {
  membro_id: string | null
  acao: string
  alvo_id?: string | null
  detalhe?: Record<string, unknown> | null
}

export const registrarNaEquipeStep = createStep(
  "registrar-na-equipe",
  async (anotacao: Anotacao, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const linha = await equipe.createRegistros({
      membro_id: anotacao.membro_id,
      acao: anotacao.acao,
      alvo_id: anotacao.alvo_id ?? null,
      detalhe: anotacao.detalhe ?? null,
    })
    return new StepResponse(linha.id, linha.id)
  },
  async (id, { container }) => {
    if (!id) return
    await container.resolve<EquipeService>(EQUIPE).deleteRegistros(id)
  }
)
