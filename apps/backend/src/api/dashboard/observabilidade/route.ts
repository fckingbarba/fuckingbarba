import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { lerTela } from "../../../lib/observabilidade/tela"

/**
 * GET /dashboard/observabilidade — a saúde da loja: os problemas em frase,
 * com o que fazer, as integrações e as rotinas (`lib/painel/observabilidade.ts`).
 * Antes de ler, o vigia põe a tabela em dia (no máximo a cada 30 segundos).
 * Dono e operação; o estorno que não saiu só vai pro dono.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "observabilidade")) return
  res.json(await lerTela(req.scope, pedido.membro.papel))
}
