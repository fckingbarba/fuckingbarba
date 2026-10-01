import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { lerTelaDoWhatsapp } from "../../../lib/painel/ler-whatsapp"
import { lerPagina } from "../../../lib/painel/paginas"
import { ehFiltro } from "../../../lib/painel/whatsapp"

/**
 * GET /dashboard/whatsapp[?filtro=todas|equipe|atendente&busca=…&pagina=N] —
 * as conversas do WhatsApp da loja (`lib/painel/ler-whatsapp.ts`): a última
 * mensagem de cada uma, quem está cuidando (o atendente ou a equipe) e os
 * números do topo. De 30 em 30. Dono e operação.
 *
 * O telefone sai inteiro só pra quem abre os `contatos`.
 *
 * RESPOSTAS: 200 a tela; 403 `sem_acesso`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const q = req.query as { filtro?: unknown; busca?: unknown; pagina?: unknown }
  res.json(
    await lerTelaDoWhatsapp(req.scope, {
      filtro: ehFiltro(q.filtro) ? q.filtro : "todas",
      busca: typeof q.busca === "string" ? q.busca : null,
      pagina: lerPagina(q.pagina),
      contatos: abre(pedido, "contatos"),
    })
  )
}
