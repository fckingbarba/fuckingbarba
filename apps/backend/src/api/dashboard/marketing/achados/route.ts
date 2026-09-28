import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerAchadosDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo, type BuscaDoPeriodo } from "../../../../lib/painel/periodo"
import { PERIODO_PADRAO } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/achados?periodo=30d — "O que os dados dizem", no
 * Resumo: as frases de todas as abas juntas, do que pede conserto pro que vai
 * bem, cada uma com a aba de onde veio (`lib/painel/marketing-achados.ts`). As
 * contas são as mesmas das abas (`lib/painel/ler-marketing.ts`): o Resumo diz o
 * mesmo que elas. Sem o Google, as frases da loja vêm do mesmo jeito, e o
 * `semGoogle` diz por que faltam as do funil, dos canais e dos produtos. Do
 * dono e do marketing.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  const agora = new Date()
  const periodo = lerPeriodo(req.query as BuscaDoPeriodo, agora, PERIODO_PADRAO)
  res.json(await lerAchadosDoMarketing(req.scope, periodo, agora))
}
