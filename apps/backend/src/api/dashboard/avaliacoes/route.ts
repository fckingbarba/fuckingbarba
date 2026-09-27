import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ehFiltro } from "../../../lib/painel/avaliacoes"
import { lerTelaDasAvaliacoes } from "../../../lib/painel/ler-avaliacoes"
import { lerPagina } from "../../../lib/painel/paginas"

/**
 * GET /dashboard/avaliacoes[?filtro=novas|no-site|recusadas&pagina=N] — as
 * avaliações que chegaram pela página `/avaliar`, pra aprovar ou recusar
 * (`lib/painel/avaliacoes.ts`). O número do pedido só vai pra quem abre os
 * pedidos. De 30 em 30; as contas das fitas e a média do site olham todas.
 *
 * RESPOSTAS: 200 a tela; 403 `sem_acesso`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "avaliacoes")) return
  const q = req.query as { filtro?: unknown; pagina?: unknown }
  res.json(
    await lerTelaDasAvaliacoes(req.scope, {
      filtro: ehFiltro(q.filtro) ? q.filtro : "novas",
      pagina: lerPagina(q.pagina),
      verPedido: abre(pedido, "pedidos"),
    })
  )
}
