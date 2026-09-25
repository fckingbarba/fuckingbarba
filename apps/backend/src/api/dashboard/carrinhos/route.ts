import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ehFiltro } from "../../../lib/painel/carrinhos"
import { lerTelaDosCarrinhos } from "../../../lib/painel/ler-carrinhos"

/**
 * GET /dashboard/carrinhos?filtro=parados|agora|voltaram — os carrinhos que
 * não viraram pedido nos últimos 30 dias, uma linha por pessoa, com o passo
 * em que ela parou e o link do WhatsApp (`lib/painel/carrinhos.ts`).
 *
 * Dono, operação e marketing. O marketing vê o e-mail mascarado e não vê o
 * telefone — nem o botão do WhatsApp —, como nos clientes.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "carrinhos")) return
  const q = req.query as { filtro?: unknown }
  res.json(
    await lerTelaDosCarrinhos(req.scope, {
      filtro: ehFiltro(q.filtro) ? q.filtro : "parados",
      verContato: pedido.membro.papel !== "marketing",
    })
  )
}
