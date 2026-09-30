import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ehFiltro } from "../../../lib/painel/carrinhos"
import { lerTelaDosCarrinhos } from "../../../lib/painel/ler-carrinhos"
import { lerPagina, paginar } from "../../../lib/painel/paginas"

/**
 * GET /dashboard/carrinhos?filtro=parados|agora|voltaram — os carrinhos que
 * não viraram pedido nos últimos 30 dias, uma linha por pessoa, com o passo
 * em que ela parou e o link do WhatsApp (`lib/painel/carrinhos.ts`).
 *
 * Dono, operação e marketing. O marketing vê o e-mail mascarado e não vê o
 * telefone — nem o botão do WhatsApp —, como nos clientes: é quem não abre
 * os `contatos` (o papel criado pelo dono, o dono marca).
 *
 * Em páginas de 30 (`?pagina=`): os números e as fitas contam todos.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "carrinhos")) return
  const q = req.query as { filtro?: unknown; pagina?: unknown }
  const tela = await lerTelaDosCarrinhos(req.scope, {
    filtro: ehFiltro(q.filtro) ? q.filtro : "parados",
    verContato: abre(pedido, "contatos"),
  })
  const { itens, paginacao } = paginar(tela.carrinhos, lerPagina(q.pagina))
  res.json({ ...tela, carrinhos: itens, paginacao })
}
