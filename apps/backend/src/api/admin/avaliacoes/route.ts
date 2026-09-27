import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AVALIACOES } from "../../../modules/avaliacoes"
import type AvaliacoesService from "../../../modules/avaliacoes/service"

/**
 * GET /admin/avaliacoes[?pedido=order_…] — as avaliações como estão no
 * banco (a situação, quem moderou), as mais novas primeiro. Pro conferidor
 * e pra quem cuida da loja; a tela é a do painel (`/dashboard/avaliacoes`).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pedido = (req.query as { pedido?: unknown }).pedido
  const avaliacoes = await req.scope
    .resolve<AvaliacoesService>(AVALIACOES)
    .listAvaliacoes(typeof pedido === "string" && pedido ? { pedido_id: pedido } : {}, {
      order: { created_at: "DESC" },
      take: 500,
    })
  res.json({ avaliacoes })
}
