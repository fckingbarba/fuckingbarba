import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Dados iniciais da loja — roda UMA vez, automaticamente, no primeiro
 * `medusa db:migrate` (scripts desta pasta são registrados como migração).
 *
 * O que cria: loja em BRL, região Brasil, imposto BR (provider do sistema —
 * o preço já é final, sem cálculo de imposto), canal de venda "Loja online",
 * chave publicável (a que o Next.js usa), local de estoque, zona de entrega
 * Brasil e as três categorias que viram as URLs /barba, /cabelo e /kits.
 *
 * O que NÃO cria, de propósito: produto (vem da exportação da Nuvemshop na
 * fase 2), opção de frete (Frenet, fase 5) e método de pagamento (Pagar.me,
 * fase 4). Nada de dado de exemplo em produção.
 */
export default async function dadosIniciais({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(ModuleRegistrationName.FULFILLMENT)

  logger.info("[seed] canal de venda e chave publicável")
  const {
    result: [canal],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [{ name: "Loja online", description: "Site fuckingbarba (Next.js)" }],
    },
  })

  const {
    result: [chave],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [{ title: "Loja online (Next.js)", type: "publishable", created_by: "" }],
    },
  })
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: chave.id, add: [canal.id] },
  })

  logger.info("[seed] loja em BRL")
  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "FuckingBarba",
          supported_currencies: [{ currency_code: "brl", is_default: true }],
          default_sales_channel_id: canal.id,
        },
      ],
    },
  })

  logger.info("[seed] região Brasil")
  await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Brasil",
          currency_code: "brl",
          countries: ["br"],
          // Provider de sistema só pra a região existir; o Pagar.me entra na fase 4.
          payment_providers: ["pp_system_default"],
          // Preço de vitrine já é o preço final (imposto embutido, como manda o CDC).
          automatic_taxes: false,
        },
      ],
    },
  })

  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "br", provider_id: "tp_system" }],
  })

  logger.info("[seed] estoque e zona de entrega")
  const {
    result: [estoque],
  } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Estoque principal",
          // Preencha no admin: é o endereço de origem que a Frenet usa pra cotar.
          address: { city: "", country_code: "BR", address_1: "" },
        },
      ],
    },
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: estoque.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  const conjunto = await fulfillment.createFulfillmentSets({
    name: "Entrega Brasil",
    type: "shipping",
    service_zones: [{ name: "Brasil", geo_zones: [{ country_code: "br", type: "country" }] }],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: estoque.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: conjunto.id },
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: estoque.id, add: [canal.id] },
  })

  logger.info("[seed] categorias /barba, /cabelo e /kits")
  await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        { name: "Barba", handle: "barba", is_active: true, rank: 0 },
        { name: "Cabelo", handle: "cabelo", is_active: true, rank: 1 },
        { name: "Kits", handle: "kits", is_active: true, rank: 2 },
      ],
    },
  })

  logger.info(
    `[seed] pronto. Chave publicável da loja: ${chave.token} — copie pra NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY do Next.js`
  )
}
