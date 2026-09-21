import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { MetadadosDoCodigo } from "../../modules/codigo/regras"

/**
 * GUARDAR O CÓDIGO DE ACESSO — no `provider_metadata` da identidade `codigo`
 * do e-mail, criando a identidade na primeira vez.
 *
 * Em workflow, e não direto na rota, porque é assim que o Medusa quer toda
 * escrita (o lint do build avisa): o passo sabe se desfazer. A identidade
 * que ele criou some; a que já existia volta com o que tinha antes.
 *
 * Quem decide SE pode guardar (os limites de `regras.ts`) é a rota, antes —
 * isto só escreve.
 */

type Entrada = { email: string; metadados: MetadadosDoCodigo }

type Desfazer =
  | { tipo: "criou"; id: string }
  | { tipo: "atualizou"; id: string; antes: Record<string, unknown> | null }

const gravarCodigoStep = createStep(
  "gravar-codigo",
  async ({ email, metadados }: Entrada, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const [existente] = await auth.listProviderIdentities({ provider: "codigo", entity_id: email })

    if (existente) {
      await auth.updateProviderIdentities({ id: existente.id, provider_metadata: metadados })
      return new StepResponse<void, Desfazer>(undefined, {
        tipo: "atualizou",
        id: existente.id,
        antes: (existente.provider_metadata as Record<string, unknown> | null) ?? null,
      })
    }

    const criada = await auth.createAuthIdentities({
      provider_identities: [{ provider: "codigo", entity_id: email, provider_metadata: metadados }],
    })
    return new StepResponse<void, Desfazer>(undefined, { tipo: "criou", id: criada.id })
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    const auth = container.resolve(Modules.AUTH)
    if (desfazer.tipo === "criou") await auth.deleteAuthIdentities([desfazer.id])
    else
      await auth.updateProviderIdentities({
        id: desfazer.id,
        provider_metadata: desfazer.antes ?? {},
      })
  }
)

export const guardarCodigoWorkflow = createWorkflow("guardar-codigo", (entrada: Entrada) => {
  gravarCodigoStep(entrada)
  return new WorkflowResponse(undefined)
})
