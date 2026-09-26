import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  avisarNoLog,
  configuracaoDoGa4,
  ErroDoGa4,
  relatoriosDoMarketing,
} from "../../../../lib/painel/ga4"
import { pedidosDesde } from "../../../../lib/painel/ler"
import { estoquesDos, lerProdutos } from "../../../../lib/painel/ler-produtos"
import { janelasDo, lerPedidosDesde, lerPeriodo, vendasDos } from "../../../../lib/painel/marketing"
import {
  catalogoDos,
  montarProdutos,
  perguntaDosProdutos,
} from "../../../../lib/painel/marketing-produtos"
import type { RelatorioGa4 } from "../../../../lib/painel/visitas"

/**
 * GET /dashboard/marketing/produtos?periodo=30d — o que cada produto atrai,
 * põe na sacola e vende, com os sinais (esgotado, acabando, muita visita e
 * pouca sacola) — `lib/painel/marketing-produtos.ts`. Do dono e do
 * marketing.
 *
 * Sem o Google, a lista vem do mesmo jeito (o vendido, a receita e o
 * estoque são da loja), com as visitas em branco e o `estado` dizendo por quê.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const [produtos, pedidos] = await Promise.all([
    lerProdutos(req.scope),
    pedidosDesde(req.scope, lerPedidosDesde(periodo, agora)),
  ])
  const catalogo = catalogoDos(produtos, await estoquesDos(req.scope, produtos))
  const vendas = vendasDos(pedidos)
  const { atual } = janelasDo(periodo, agora)

  let ga: RelatorioGa4 | null = null
  let estado: "ok" | "desligado" | "invalida" | "recusado" | "fora" = "ok"
  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") estado = cfg
  else
    try {
      ;[ga] = await relatoriosDoMarketing(
        cfg,
        `produtos:${periodo}`,
        [perguntaDosProdutos(periodo)],
        agora
      )
    } catch (e) {
      estado = e instanceof ErroDoGa4 ? e.tipo : "fora"
      avisarNoLog(
        req.scope,
        "os produtos do marketing",
        estado,
        e instanceof Error ? e.message : String(e)
      )
    }

  res.json({ periodo, estado, ...montarProdutos(catalogo, vendas, atual, ga) })
}
