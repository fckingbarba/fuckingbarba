import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { contaDoToken } from "../../../../lib/conta-do-token"
import { indicacaoDaConta } from "../../../../lib/crm/indicacao"
import { urlDaLoja } from "../../../../lib/emails/moldura"
import { criarLimite } from "../../../../lib/limite"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * O INDIQUE UM BROTHER EM MINHA CONTA (entrega 0215, `lib/crm/indicacao.ts`):
 *
 *   - GET: o link da pessoa (se já tem), quantos brothers compraram com ele,
 *     e os cupons que ela ganhou — o brother não aparece;
 *   - POST: o "Pegar meu link" — cria o link, se ainda não tem, e devolve o
 *     mesmo que o GET.
 *
 * Só com token de cliente de verdade: o e-mail é o da conta do token. 60 por
 * hora por conta. RESPOSTAS: 200 `{ indicacao }` (nula sem a loja no ar ou
 * sem e-mail); 429 `limite`.
 */
const LIMITE = { limite: 60, ms: 60 * 60 * 1000 }
const limite = criarLimite()

async function responder(req: AuthenticatedMedusaRequest, res: MedusaResponse, criar: boolean) {
  const conta = await contaDoToken(
    req.scope.resolve(Modules.AUTH),
    req.auth_context.auth_identity_id
  )
  const email = normalizarEmail(conta.email)
  const loja = urlDaLoja()
  const chave = `indicacao:${conta.identidadeId}`
  if (!limite.cabe(chave, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(chave, LIMITE)
  if (!email || !loja) {
    res.json({ indicacao: null })
    return
  }
  try {
    res.json({ indicacao: await indicacaoDaConta(req.scope, email, { loja, criar }) })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[crm] o indique da conta não saiu — ${e instanceof Error ? e.message : String(e)}`)
    res.json({ indicacao: null })
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await responder(req, res, false)
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await responder(req, res, true)
}
