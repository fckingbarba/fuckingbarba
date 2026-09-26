import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { podeAbrir } from "../../../lib/equipe/regras"
import { pedidosDesde } from "../../../lib/painel/ler"
import { lerMetas, lerPedidosDesde, lerPeriodo, montarResumo } from "../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing?periodo=30d — o Resumo do Marketing
 * (`lib/painel/marketing.ts`): a receita, os pedidos pagos e o ticket do
 * período contra o de antes, a receita no tempo, os produtos que mais
 * venderam e a meta do mês. Do dono e do marketing; `mudaAMeta` diz se quem
 * pediu pode mudar a meta (só o dono).
 *
 * As visitas e a conversão vêm à parte (`/dashboard/marketing/visitas`): o
 * Google pode demorar, e o resto não espera por ele — como no Início.
 *
 * `periodo`: hoje, 7d, 30d ou 90d; o resto vira 30d.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const [pedidos, lojas] = await Promise.all([
    pedidosDesde(req.scope, lerPedidosDesde(periodo, agora)),
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  res.json({
    ...montarResumo(periodo, pedidos, lerMetas(lojas[0]?.metadata), agora),
    mudaAMeta: podeAbrir(pedido.membro.papel, "metaDoMes"),
  })
}
