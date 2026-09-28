import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { contaDoToken } from "../../../../lib/conta-do-token"
import { tirarDasOfertas } from "../../../../lib/ofertas"

/**
 * POST /store/crm/sair-das-ofertas — a caixa de ofertas por e-mail
 * desmarcada em "Meus dados" (entrega 0184). Como as ofertas vêm ligadas por
 * padrão, desmarcar é sair da lista de verdade (`tirarDasOfertas`): a
 * newsletter, a caixa da conta, a base da Nuvemshop, e a lista de quem saiu
 * — os fluxos do CRM param pra essa pessoa. Marcar de novo é um sim novo.
 *
 * Só com token de cliente de verdade: o e-mail é o da conta do token, nunca
 * o do corpo. RESPOSTAS: 200 `{ ok }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const conta = await contaDoToken(
    req.scope.resolve(Modules.AUTH),
    req.auth_context.auth_identity_id
  )
  await tirarDasOfertas(req.scope, conta.email)
  res.json({ ok: true })
}
