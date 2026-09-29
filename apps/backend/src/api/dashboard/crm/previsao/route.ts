import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { previsoesDeTodos } from "../../../../lib/crm/previsoes"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { montarTelaDaPrevisao } from "../../../../lib/painel/previsao"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * GET /dashboard/crm/previsao — a aba Previsão do CRM (entrega 0220,
 * `lib/painel/previsao.ts`): os números da base (quem deve comprar em 7 e em
 * 30 dias, a chance de sair, o LTV) e as duas listas, com o e-mail
 * mascarado. `?email=` busca uma pessoa, e aí o e-mail volta inteiro (foi
 * quem busca que digitou).
 *
 * Quem abre o CRM. RESPOSTAS: 200 a tela.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const agora = new Date()
  const busca = normalizarEmail((req.query as { email?: unknown }).email)
  res.json(
    montarTelaDaPrevisao({ pessoas: await previsoesDeTodos(req.scope, agora), agora, busca })
  )
}
