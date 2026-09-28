import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { contaDoToken } from "../../../../lib/conta-do-token"
import { lerFichaDoSite } from "../../../../lib/crm/ficha-do-site"
import { criarLimite } from "../../../../lib/limite"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * GET /store/crm/ficha — a ficha do site de quem está com a conta aberta
 * (entregas 0188 e 0190, `lib/crm/ficha-do-site.ts`): o que está acabando,
 * o dia do tratamento, o que a pessoa comprou e o que combina com isso. A
 * loja mostra na conta, na home e na página de cada produto.
 *
 * Só com token de cliente de verdade: o e-mail é o da conta do token, nunca
 * o do pedido. 60 por hora por conta — a loja guarda a resposta na aba. A
 * ficha é um extra: qualquer tropeço vira `{ ficha: null }`, e não erro.
 */

const LIMITE = { limite: 60, ms: 60 * 60 * 1000 }
const limite = criarLimite()

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const conta = await contaDoToken(
    req.scope.resolve(Modules.AUTH),
    req.auth_context.auth_identity_id
  )
  const email = normalizarEmail(conta.email)
  const chave = `ficha:${conta.identidadeId}`
  if (!email || !limite.cabe(chave, LIMITE)) {
    res.json({ ficha: null })
    return
  }
  limite.contar(chave, LIMITE)
  try {
    res.json({ ficha: await lerFichaDoSite(req.scope, email) })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[crm] a ficha do site não saiu — ${e instanceof Error ? e.message : String(e)}`)
    res.json({ ficha: null })
  }
}
