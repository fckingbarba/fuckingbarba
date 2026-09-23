import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NEWSLETTER } from "../../../modules/newsletter"
import type NewsletterService from "../../../modules/newsletter/service"

/**
 * GET /admin/newsletter — a lista inteira, mais recentes primeiro, pra tela
 * "Newsletter" do admin (que também baixa em CSV). Rota de admin: só com
 * login de administrador, como todo /admin.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsletter = req.scope.resolve<NewsletterService>(NEWSLETTER)
  const [inscricoes, total] = await newsletter.listAndCountInscricoes(
    {},
    { order: { consentido_em: "DESC" } }
  )
  res.json({
    total,
    inscricoes: inscricoes.map((i) => ({
      id: i.id,
      email: i.email,
      origem: i.origem,
      consentido_em: i.consentido_em,
    })),
  })
}
