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
 * Quem chama é `POST /store/newsletter` (o rodapé) e o cadastro do pop-up da
 * 1ª compra (`lib/crm/primeira-compra.ts`). O e-mail já chega normalizado
 * (minúsculas, sem espaço) e validado; a origem, conferida contra a lista
 * de origens de quem chama. O nome e a página vêm só do pop-up: quem já
 * estava na lista pelo rodapé ganha os dois, sem mudar a data do "sim".
 */

type Entrada = {
  email: string
  origem: string | null
  nome?: string | null
  pagina?: string | null
}

const gravarInscricaoStep = createStep(
  "gravar-inscricao",
  async ({ email, origem, nome = null, pagina = null }: Entrada, { container }) => {
    const newsletter = container.resolve<NewsletterService>(NEWSLETTER)
    const [existente] = await newsletter.listInscricoes({ email })
    if (existente) {
      const falta = {
        ...(nome && !existente.nome ? { nome } : {}),
        ...(pagina && !existente.pagina ? { pagina } : {}),
      }
      if (Object.keys(falta).length)
        await newsletter.updateInscricoes({ id: existente.id, ...falta })
      return new StepResponse({ nova: false }, null)
    }

    try {
      const criada = await newsletter.createInscricoes({
        email,
        origem,
        nome,
        pagina,
        consentido_em: new Date(),
      })
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
