import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  calculateShippingOptionsPricesWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
  maybeRefreshShippingMethodsWorkflow,
} from "@medusajs/medusa/core-flows"
import { lerConfiguracoes } from "../../lib/configuracoes"
import { CHAVE_NO_CONTEXTO } from "../../modules/frenet/service"

/**
 * O QUE O PROVEDOR DE FRETE NÃO CONSEGUE LER SOZINHO.
 *
 * O provedor da Frenet precisa de três coisas que não estão no carrinho: a
 * política de frete grátis, o preço de emergência e o CEP de onde as
 * encomendas saem. As três moram nas configurações da loja.
 *
 * ┌─ POR QUE ISTO NÃO ESTÁ DENTRO DO PROVEDOR ─────────────────────────────┐
 * │ Módulo do Medusa é isolado: o provedor vive no contêiner do módulo de  │
 * │ fulfillment e não alcança o módulo de loja. Dependendo do jeito que o  │
 * │ Medusa monta o contêiner, um `resolve(Modules.STORE)` lá dentro até    │
 * │ funciona hoje — e quebra numa atualização, no ambiente em que ninguém  │
 * │ testou, com o checkout aberto.                                        │
 * │                                                                        │
 * │ O gancho é a porta oficial: ele roda no app, onde tudo está ao         │
 * │ alcance, e o que ele devolve é mesclado no `context` que o provedor    │
 * │ recebe. O provedor continua sendo uma função dos seus argumentos, que  │
 * │ é o que deixa ele testável sem subir meio Medusa.                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO TRÊS GANCHOS, E ESQUECER UM É UM BUG CARO ────────────────────────┐
 * │ O Medusa calcula frete em três momentos diferentes, cada um com o seu  │
 * │ fluxo:                                                                 │
 * │                                                                        │
 * │   · `calculate` — o checkout perguntando o preço de uma opção. É o     │
 * │     mais usado, e é a rota que a tela de entrega chama por opção;      │
 * │   · `listWithPricing` — listar já com preço, usado por outros fluxos;  │
 * │   · `maybeRefresh` — o recálculo do frete JÁ escolhido, quando o       │
 * │     carrinho muda ou o cliente volta depois de um tempo.               │
 * │                                                                        │
 * │ Faltando um, o preço muda SOZINHO entre duas telas: a de entrega       │
 * │ mostra frete grátis e a de pagamento cobra o cheio, porque o           │
 * │ recálculo não recebeu a política. Os três recebem o mesmo objeto, da   │
 * │ mesma função — é o que garante que não exista essa versão.             │
 * └────────────────────────────────────────────────────────────────────────┘
 */

type Container = { resolve: (chave: string) => unknown }

async function contextoDoFrete(container: Container) {
  const loja = container.resolve(Modules.STORE) as {
    listStores: (
      f: object,
      c: object
    ) => Promise<{ id: string; metadata: Record<string, unknown> | null }[]>
  }
  const [dados] = await loja.listStores({}, { select: ["id", "metadata"], take: 1 })
  const { frete, cotacao } = lerConfiguracoes(dados?.metadata)

  /*
    O CEP de origem sai do ENDEREÇO DO LOCAL DE ESTOQUE, que é onde o Medusa
    já guarda de onde as coisas saem — e não de mais um campo nas
    configurações. Dois lugares pra dizer a mesma coisa é a origem de metade
    dos números divergentes deste projeto.

    Quando o local não tem endereço, fica `null`: o provedor reclama com uma
    frase que diz onde cadastrar, em vez de cotar de um CEP inventado.
  */
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: object) => Promise<{ data: { address?: { postal_code?: string | null } | null }[] }>
  }
  const { data: locais } = await query.graph({
    entity: "stock_location",
    fields: ["id", "address.postal_code"],
  })

  return {
    [CHAVE_NO_CONTEXTO]: {
      politica: frete,
      precoDeEmergencia: cotacao.precoDeEmergencia,
      cepDeOrigem: locais.find((l) => l.address?.postal_code)?.address?.postal_code ?? null,
    },
  }
}

calculateShippingOptionsPricesWorkflow.hooks.setCalculatedShippingPricingContext(
  async (_entrada, { container }) => new StepResponse(await contextoDoFrete(container as Container))
)

listShippingOptionsForCartWithPricingWorkflow.hooks.setCalculatedShippingPricingContext(
  async (_entrada, { container }) => new StepResponse(await contextoDoFrete(container as Container))
)

maybeRefreshShippingMethodsWorkflow.hooks.setCalculatedShippingPricingContext(
  async (_entrada, { container }) => new StepResponse(await contextoDoFrete(container as Container))
)
