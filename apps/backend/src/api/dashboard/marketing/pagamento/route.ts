import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../../../../lib/configuracoes"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { carrinhosComPagamento, pedidosComPagamento } from "../../../../lib/painel/ler"
import { janelasDo, lerPedidosDesde, lerPeriodo } from "../../../../lib/painel/marketing"
import { montarPagamento } from "../../../../lib/painel/marketing-pagamento"

/**
 * GET /dashboard/marketing/pagamento?periodo=30d — como as pessoas pagam, o
 * que não passa (o Pix que vence, o cartão recusado e por quem) e o que o
 * frete faz com a venda (`lib/painel/marketing-pagamento.ts`). Tudo da loja:
 * o estado que o Pagar.me deixa em cada sessão. Do dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const { atual } = janelasDo(periodo, agora)
  const [pedidos, carrinhos, lojas] = await Promise.all([
    // Os pedidos com a folga do Resumo: o feito antes e pago dentro conta como pago no período.
    pedidosComPagamento(req.scope, lerPedidosDesde(periodo, agora)),
    carrinhosComPagamento(req.scope, atual.de),
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const politica = lerConfiguracoes(lojas[0]?.metadata).frete
  res.json({ periodo, ...montarPagamento(pedidos, carrinhos, politica, atual, agora) })
}
