import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { vincularClienteWorkflow } from "../../../../workflows/conta/vincular-cliente"

/**
 * POST /store/conta/vincular — liga quem acabou de provar o e-mail a um
 * cliente. Roda uma vez, no primeiro código confirmado.
 *
 * O `POST /auth/customer/codigo` devolve um token que prova o e-mail, mas
 * ainda não diz QUEM é o cliente (o `actor_id` vem vazio). A loja chama esta
 * rota com esse token, e depois `POST /auth/token/refresh` pra ter o token
 * de cliente de verdade.
 *
 * Quem é o cliente — o que já tinha conta, o convidado do checkout que vira
 * conta, ou um novo — é o `vincularClienteWorkflow` que decide
 * (`workflows/conta/vincular-cliente.ts`, com o porquê).
 *
 * Só aceita identidade do provedor `codigo`: ela é a prova do e-mail.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const auth = req.scope.resolve(Modules.AUTH)
  const trava = req.scope.resolve(Modules.LOCKING)

  const identidade = await auth.retrieveAuthIdentity(req.auth_context.auth_identity_id, {
    relations: ["provider_identities"],
  })
  const doCodigo = identidade.provider_identities?.find((p) => p.provider === "codigo")
  if (!doCodigo) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "sem_codigo")
  }

  const jaLigado = identidade.app_metadata?.customer_id
  if (typeof jaLigado === "string" && jaLigado) {
    res.json({ cliente_id: jaLigado })
    return
  }

  // Uma vez por e-mail: dois cliques no "entrar" não criam dois clientes.
  const clienteId = await trava.execute(
    `conta:vincular:${doCodigo.entity_id}`,
    async () => {
      // Dentro da trava, de novo: quem esperou a vez pode achar tudo pronto.
      const agora = await auth.retrieveAuthIdentity(identidade.id)
      const ligado = agora.app_metadata?.customer_id
      if (typeof ligado === "string" && ligado) return ligado

      const { result } = await vincularClienteWorkflow(req.scope).run({
        input: { authIdentityId: identidade.id, email: doCodigo.entity_id },
      })
      return result
    },
    { timeout: 5 }
  )

  res.json({ cliente_id: clienteId })
}
