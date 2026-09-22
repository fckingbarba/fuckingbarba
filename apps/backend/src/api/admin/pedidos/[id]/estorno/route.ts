import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { tentarEstornoAgora } from "../../../../../lib/estornos"

/**
 * POST /admin/pedidos/:id/estorno — "Tentar o estorno de novo", o botão da
 * faixa vermelha do pedido no admin (`src/admin/widgets/estorno.tsx`).
 *
 * Confere a cobrança no Pagar.me e, se o estorno do pagamento inteiro
 * falhou e nada está andando, pede de novo NA HORA — em vez de esperar a
 * vez dele, de 6 em 6 horas. O resto da conferência é a mesma da rodada da
 * conciliação (`lib/estornos.ts`): estorno em andamento não é pedido de
 * novo, e o parcial fica pro painel do Pagar.me.
 *
 * `resultado`: "pedido" (pediu, o Pagar.me aceitou — confirma em minutos),
 * "devolvido", "andando", "sem-estorno" ou "nao-da" (com o `motivo`).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const tentativa = await tentarEstornoAgora(req.scope, req.params.id)
  res.json(tentativa)
}
