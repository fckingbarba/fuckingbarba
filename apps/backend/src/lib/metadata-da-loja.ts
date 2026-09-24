import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"

/**
 * O METADATA DA LOJA, GRAVADO SEM ATROPELAR NINGUÉM.
 *
 * Três coisas moram no `metadata` da loja: as configurações (`fb_configuracoes`,
 * do admin), a home (`fb_home`, do painel) e o registro das transportadoras.
 * E o módulo de loja do Medusa, ao contrário do de produto, NÃO junta o
 * metadata: grava o objeto que recebe, inteiro, no lugar do que estava. Quem
 * grava uma chave precisa mandar as outras junto — lidas agora.
 *
 * "Lidas agora" é o ponto. Sem trava, duas gravações ao mesmo tempo leem o
 * mesmo metadata, e a segunda a gravar apaga o que a primeira gravou: a
 * home publicada some porque alguém salvou o frete no mesmo segundo. Aqui a
 * leitura, a mudança e a gravação acontecem dentro de UMA trava, e quem
 * chega depois espera.
 */

const TRAVA = "loja:metadata"

export type MudancaNoMetadata<R> = {
  /** As chaves a gravar (as outras ficam como estão). Sem nada, não grava. */
  gravar?: Record<string, unknown>
  resultado: R
}

/**
 * Lê o metadata da loja, deixa `mudar` decidir o que gravar, e grava — tudo
 * dentro da trava. `null` quando o Medusa não tem loja nenhuma.
 */
export async function mudarMetadataDaLoja<R>(
  container: MedusaContainer,
  mudar: (metadata: Record<string, unknown>) => MudancaNoMetadata<R>
): Promise<R | null> {
  return container.resolve(Modules.LOCKING).execute(
    TRAVA,
    async (): Promise<R | null> => {
      const [loja] = await container
        .resolve(Modules.STORE)
        .listStores({}, { select: ["id", "metadata"], take: 1 })
      if (!loja) return null
      const atual = (loja.metadata ?? {}) as Record<string, unknown>
      const { gravar, resultado } = mudar(atual)
      if (gravar && Object.keys(gravar).length) {
        // Pelo workflow, e não pelo serviço: passo compensável, e é o que o lint do Medusa cobra.
        await updateStoresWorkflow(container).run({
          input: { selector: { id: loja.id }, update: { metadata: { ...atual, ...gravar } } },
        })
      }
      return resultado
    },
    { timeout: 30 }
  )
}
