import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ehFiltro } from "../../../lib/painel/criadores"
import { lerTelaDosCriadores } from "../../../lib/painel/ler-criadores"
import { lerPagina } from "../../../lib/painel/paginas"

/**
 * GET /dashboard/criadores[?filtro=novas|aprovadas|recusadas&pagina=N] — as
 * inscrições da página escondida `/criadores` da loja, pra aprovar ou
 * recusar (`lib/painel/criadores.ts`), com o link da página pra mandar. De
 * 30 em 30; as contas das fitas e dos modelos olham todas. Marketing e dono.
 *
 * RESPOSTAS: 200 a tela; 403 `sem_acesso`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "criadores")) return
  const q = req.query as { filtro?: unknown; pagina?: unknown }
  res.json(
    await lerTelaDosCriadores(req.scope, {
      filtro: ehFiltro(q.filtro) ? q.filtro : "novas",
      pagina: lerPagina(q.pagina),
    })
  )
}
