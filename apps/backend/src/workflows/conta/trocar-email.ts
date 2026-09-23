import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import type { MetadadosDoCodigo } from "../../modules/codigo/regras"

/**
 * TROCAR O E-MAIL DA CONTA — depois que o código do endereço novo conferiu.
 *
 * ┌─ O E-MAIL MORA EM DOIS LUGARES, E OS DOIS MUDAM JUNTOS ────────────────┐
 * │ 1. Na identidade `codigo` (`provider_identity.entity_id`): é a CHAVE   │
 * │    de entrar. É ela que decide pra onde vai o código.                  │
 * │ 2. No cliente (`customer.email`): é o que a conta mostra, o que o      │
 * │    checkout põe no carrinho e o que o Medusa usa pra ligar carrinho a  │
 * │    conta.                                                              │
 * │ Mudar só o 2 deixaria o código indo pro endereço velho; só o 1, a      │
 * │ conta mostrando um e-mail e entrando por outro.                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A IDENTIDADE ÓRFÃ. Pedir código de entrar com um e-mail cria a identidade
 * dele antes de ele ser confirmado (é onde o código fica guardado — ver
 * `guardar-codigo.ts`). Se o e-mail novo tem uma dessas, SEM cliente ligado,
 * ela sai primeiro: o banco não deixa duas identidades `codigo` com o mesmo
 * e-mail. Com cliente ligado ela é uma CONTA, e a rota nem chega aqui
 * (responde `email_em_uso`).
 *
 * Os pedidos já feitos continuam com o e-mail da compra — é o registro do
 * que aconteceu, e é pra lá que os avisos DELES vão.
 *
 * Nesta ordem, e cada passo se desfaz se um de depois falhar: a identidade
 * volta pro e-mail de antes (com o `provider_metadata` de antes), e a órfã
 * volta a existir.
 */

type Entrada = {
  /** A linha `provider_identity` do `codigo` da conta. */
  provedorId: string
  clienteId: string
  novo: string
  /** O `provider_metadata` que fica — já sem a troca pendente. */
  metadados: MetadadosDoCodigo
  /** A identidade de auth órfã do e-mail novo, se houver. */
  orfa: string | null
}

type Orfa = {
  id: string
  app_metadata: Record<string, unknown> | undefined
  provider_identities: {
    provider: string
    entity_id: string
    provider_metadata?: Record<string, unknown>
    user_metadata?: Record<string, unknown>
  }[]
}

const apagarIdentidadeOrfaStep = createStep(
  "apagar-identidade-orfa",
  async ({ orfa }: { orfa: string | null }, { container }) => {
    if (!orfa) return new StepResponse<void, Orfa | null>(undefined, null)
    const auth = container.resolve(Modules.AUTH)
    const antes = await auth.retrieveAuthIdentity(orfa, { relations: ["provider_identities"] })
    await auth.deleteAuthIdentities([orfa])
    return new StepResponse<void, Orfa | null>(undefined, {
      id: antes.id,
      app_metadata: antes.app_metadata ?? undefined,
      provider_identities: (antes.provider_identities ?? []).map((p) => ({
        provider: p.provider,
        entity_id: p.entity_id,
        provider_metadata: p.provider_metadata,
        user_metadata: p.user_metadata,
      })),
    })
  },
  async (orfa, { container }) => {
    if (!orfa) return
    await container.resolve(Modules.AUTH).createAuthIdentities(orfa)
  }
)

type Antes = { id: string; entity_id: string; provider_metadata: Record<string, unknown> }

const mudarEmailDaIdentidadeStep = createStep(
  "mudar-email-da-identidade",
  async (
    { provedorId, novo, metadados }: Pick<Entrada, "provedorId" | "novo" | "metadados">,
    { container }
  ) => {
    const auth = container.resolve(Modules.AUTH)
    const [antes] = await auth.listProviderIdentities({ id: [provedorId] })
    await auth.updateProviderIdentities({
      id: provedorId,
      entity_id: novo,
      provider_metadata: metadados,
    })
    return new StepResponse<void, Antes>(undefined, {
      id: provedorId,
      entity_id: antes.entity_id,
      provider_metadata: antes.provider_metadata ?? {},
    })
  },
  async (antes, { container }) => {
    if (!antes) return
    await container.resolve(Modules.AUTH).updateProviderIdentities(antes)
  }
)

export const trocarEmailWorkflow = createWorkflow("trocar-email", (entrada: Entrada) => {
  apagarIdentidadeOrfaStep({ orfa: entrada.orfa })
  mudarEmailDaIdentidadeStep({
    provedorId: entrada.provedorId,
    novo: entrada.novo,
    metadados: entrada.metadados,
  })
  updateCustomersWorkflow.runAsStep({
    input: transform({ entrada }, ({ entrada }) => ({
      selector: { id: entrada.clienteId },
      update: { email: entrada.novo },
    })),
  })
  return new WorkflowResponse(entrada.novo)
})
