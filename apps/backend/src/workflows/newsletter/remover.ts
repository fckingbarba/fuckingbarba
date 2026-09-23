import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { NEWSLETTER } from "../../modules/newsletter"
import type NewsletterService from "../../modules/newsletter/service"

/**
 * Tira um e-mail da lista, apagando a linha — o pedido de "sair" e o de
 * exclusão da LGPD são a mesma coisa aqui (ver o modelo `inscricao`).
 *
 * Quem chama é `DELETE /admin/newsletter/:id`. Se algo depois falhar, a
 * linha volta como estava, com a mesma data de consentimento.
 */

type Apagada = { email: string; origem: string | null; consentido_em: Date }

const apagarInscricaoStep = createStep(
  "apagar-inscricao",
  async (id: string, { container }) => {
    const newsletter = container.resolve<NewsletterService>(NEWSLETTER)
    const [antes] = await newsletter.listInscricoes({ id })
    if (!antes) return new StepResponse({ removida: false }, null)

    await newsletter.deleteInscricoes(id)
    return new StepResponse<{ removida: boolean }, Apagada>(
      { removida: true },
      { email: antes.email, origem: antes.origem, consentido_em: antes.consentido_em }
    )
  },
  async (apagada, { container }) => {
    if (!apagada) return
    await container.resolve<NewsletterService>(NEWSLETTER).createInscricoes(apagada)
  }
)

export const removerDaNewsletterWorkflow = createWorkflow(
  "remover-da-newsletter",
  (id: string) => new WorkflowResponse(apagarInscricaoStep(id))
)
