import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { mudarHome } from "../../../../lib/painel/gravar-home"
import { ALVO_DA_HOME, desfazerRascunho } from "../../../../lib/painel/home"

/**
 * POST /dashboard/home/desfazer — joga fora o que não foi publicado: o
 * painel volta a mostrar a home que está no site. O site não muda. Dono e
 * marketing.
 *
 * RESPOSTAS: 200 `{}`; 404 `sem_loja`; 409 `nada_pra_desfazer`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const r = await mudarHome(req.scope, desfazerRascunho)
  if (!r.ok) {
    res.status(r.motivo === "sem_loja" ? 404 : 409).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "desfez-home", ALVO_DA_HOME, {})
  res.json({})
}
