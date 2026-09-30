import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { custosDosPedidos } from "../../../../lib/financeiro/custos-dos-pedidos"

/**
 * POST /admin/financeiro/custos-dos-pedidos — a rodada do job
 * `custos-dos-pedidos` agora, sem esperar os 30 minutos: a taxa de cada
 * pagamento (cartão no Pagar.me, Pix no Mercado Pago) e o frete cotado dos
 * pedidos sem a cotação do checkout. Devolve o relatório.
 *
 * Pro conferidor (`apps/dashboard/ferramentas/conferir-financeiro.mjs`), e pra
 * quem quer ver o DRE em dia logo depois de uma venda. Idempotente: o pedido
 * que já tem tudo não é lido de novo.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ relatorio: await custosDosPedidos(req.scope) })
}
