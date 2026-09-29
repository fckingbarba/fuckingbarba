import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { pedidosDoMarketing } from "../../../lib/painel/ler-marketing"
import {
  lerMetas,
  lerPedidosDesde,
  montarResumo,
  PERIODO_PADRAO,
} from "../../../lib/painel/marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../lib/painel/periodo"

/**
 * GET /dashboard/marketing?periodo=30d — o Resumo do Marketing
 * (`lib/painel/marketing.ts`): a receita, os pedidos pagos e o ticket do
 * período contra o de antes, a receita no tempo, os produtos que mais
 * venderam e a meta do mês. De quem abre o Marketing (no padrão, o dono e o
 * marketing); `mudaAMeta` diz se quem pediu pode mudar a meta (a linha
 * `metaDoMes` — no padrão, só o dono).
 *
 * As visitas e a conversão vêm à parte (`/dashboard/marketing/visitas`): o
 * Google pode demorar, e o resto não espera por ele — como no Início.
 *
 * O período é o da barra de cima (`lib/painel/periodo.ts`, 0191): `?periodo=`
 * (hoje, ontem, 7d, 30d, 90d, mes, mes-passado) ou `?de=&ate=`, e
 * `?comparar=nenhum`; sem nada (ou o que não se lê), os últimos 30 dias.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  const [pedidos, lojas] = await Promise.all([
    pedidosDoMarketing(req.scope, lerPedidosDesde(periodo, agora)),
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  res.json({
    ...montarResumo(periodo, pedidos, lerMetas(lojas[0]?.metadata), agora),
    mudaAMeta: abre(pedido, "metaDoMes"),
  })
}
