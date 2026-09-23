import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { NEWSLETTER } from "../../modules/newsletter"
import type NewsletterService from "../../modules/newsletter/service"

/**
 * Põe um e-mail na lista da newsletter — ou não faz nada, se ele já estava.
 *
 * Quem chama é `POST /store/newsletter`. O e-mail já chega normalizado
 * (minúsculas, sem espaço) e validado; a origem, conferida contra a lista
 * de origens da rota.
 */

type Entrada = { email: string; origem: string | null }

const gravarInscricaoStep = createStep(
  "gravar-inscricao",
  async ({ email, origem }: Entrada, { container }) => {
    const newsletter = container.resolve<NewsletterService>(NEWSLETTER)
    const [existente] = await newsletter.listInscricoes({ email })
    if (existente) return new StepResponse({ nova: false }, null)

    try {
      const criada = await newsletter.createInscricoes({ email, origem, consentido_em: new Date() })
      return new StepResponse({ nova: true }, criada.id)
    } catch (e) {
      // Dois envios juntos do mesmo e-mail: o segundo esbarra no índice
      // único, e o resultado é o mesmo — a pessoa está na lista.
      const [agora] = await newsletter.listInscricoes({ email })
      if (agora) return new StepResponse({ nova: false }, null)
      throw e
    }
  },
  async (criada, { container }) => {
    if (!criada) return
    await container.resolve<NewsletterService>(NEWSLETTER).deleteInscricoes(criada)
  }
)

export const inscreverNaNewsletterWorkflow = createWorkflow(
  "inscrever-na-newsletter",
  (entrada: Entrada) => new WorkflowResponse(gravarInscricaoStep(entrada))
)
