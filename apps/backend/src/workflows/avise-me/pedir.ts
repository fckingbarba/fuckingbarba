import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { AVISE_ME } from "../../modules/avise-me"
import type AviseMeService from "../../modules/avise-me/service"

/**
 * Guarda um pedido de aviso — ou não faz nada, se a pessoa já esperava por
 * esse produto.
 *
 * Quem chama é `POST /store/avise-me`. O e-mail já chega normalizado
 * (minúsculas, sem espaço) e validado; a variante, conferida contra o
 * catálogo (existe, está no site e está esgotada).
 */

type Entrada = { email: string; varianteId: string; produtoId: string }

const gravarAvisoStep = createStep(
  "gravar-aviso",
  async ({ email, varianteId, produtoId }: Entrada, { container }) => {
    const avisos = container.resolve<AviseMeService>(AVISE_ME)
    const [existente] = await avisos.listAvisos({ email, variante_id: varianteId })
    if (existente) return new StepResponse({ novo: false }, null)

    try {
      const criado = await avisos.createAvisos({
        email,
        variante_id: varianteId,
        produto_id: produtoId,
        consentido_em: new Date(),
      })
      return new StepResponse({ novo: true }, criado.id)
    } catch (e) {
      // Dois envios juntos do mesmo e-mail: o segundo esbarra no índice
      // único, e o resultado é o mesmo — a pessoa está esperando.
      const [agora] = await avisos.listAvisos({ email, variante_id: varianteId })
      if (agora) return new StepResponse({ novo: false }, null)
      throw e
    }
  },
  async (criado, { container }) => {
    if (!criado) return
    await container.resolve<AviseMeService>(AVISE_ME).deleteAvisos(criado)
  }
)

export const pedirAvisoWorkflow = createWorkflow(
  "pedir-aviso",
  (entrada: Entrada) => new WorkflowResponse(gravarAvisoStep(entrada))
)
