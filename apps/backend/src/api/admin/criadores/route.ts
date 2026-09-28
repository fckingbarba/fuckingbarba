import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRIADORES } from "../../../modules/criadores"
import type CriadoresService from "../../../modules/criadores/service"

/**
 * GET /admin/criadores[?email=…] — as inscrições de criador como estão no
 * banco (a situação, quem decidiu), as mais recentes primeiro. Pro
 * conferidor e pra quem cuida da loja; a tela é a do painel
 * (`/dashboard/criadores`).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const email = (req.query as { email?: unknown }).email
  const inscricoes = await req.scope
    .resolve<CriadoresService>(CRIADORES)
    .listInscricoes(typeof email === "string" && email ? { email: email.toLowerCase() } : {}, {
      order: { consentido_em: "DESC" },
      take: 500,
    })
  res.json({ inscricoes })
}
