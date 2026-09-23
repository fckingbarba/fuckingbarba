import type { IAuthModuleService } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import type { MetadadosDoCodigo } from "../modules/codigo/regras"

/**
 * A CONTA DE QUEM ESTÁ PEDINDO — pelo token, nunca pelo corpo do pedido.
 *
 * O e-mail da conta mora em dois lugares: no cliente (`customer.email`) e
 * na identidade `codigo`, onde ele é a CHAVE de entrar (`entity_id`). A
 * verdade, pra quem entra, é a identidade: é por ela que o código chega. Por
 * isso a troca de e-mail (`api/store/conta/email/`) lê daqui e muda os dois.
 *
 * `identidadeId` é o id da identidade de auth (o que o token carrega);
 * `provedorId`, o da linha `provider_identity` do `codigo`, que é onde
 * moram o e-mail e o `provider_metadata`.
 */
export type ContaDoToken = {
  identidadeId: string
  provedorId: string
  email: string
  meta: MetadadosDoCodigo
}

export async function contaDoToken(
  auth: IAuthModuleService,
  authIdentityId: string
): Promise<ContaDoToken> {
  const identidade = await auth.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  })
  const doCodigo = identidade.provider_identities?.find((p) => p.provider === "codigo")
  // Toda conta de cliente nasce do código; sem ele, não há e-mail pra trocar.
  if (!doCodigo) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "sem_codigo")
  return {
    identidadeId: identidade.id,
    provedorId: doCodigo.id,
    email: doCodigo.entity_id,
    meta: (doCodigo.provider_metadata ?? {}) as MetadadosDoCodigo,
  }
}
