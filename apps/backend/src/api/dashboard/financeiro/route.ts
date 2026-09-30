import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { dadosDoDre } from "../../../lib/financeiro/ler"
import { lerPeriodoDoFinanceiro, type BuscaDoFinanceiro } from "../../../lib/financeiro/regras"
import { montarTela } from "../../../lib/financeiro/tela"

/**
 * GET /dashboard/financeiro?periodo=mes|mes-passado|ano (ou `?de=2026-06&ate=2026-09`,
 * e `?comparar=nenhum`) — o DRE da loja no período: as linhas somadas, com o
 * % de cada R$ 100 vendidos e a comparação com os meses logo antes; o "de
 * cada R$ 100"; o que falta pra fechar certinho; e cada mês numa coluna.
 * A conta é do `lib/financeiro/dre.ts`. Só quem abre o Financeiro (o dono,
 * no padrão).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const agora = new Date()
  const p = lerPeriodoDoFinanceiro(req.query as BuscaDoFinanceiro, agora)
  const dados = await dadosDoDre(req.scope, p.antes?.de ?? p.atual.de, p.atual.ate)
  res.json(montarTela(p, dados, agora))
}
