import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  addToCartWorkflow,
  refreshCartItemsWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"
import { ID_DA_OFERTA, MARCA_DA_OFERTA } from "../../lib/ofertas/regras"

/**
 * O PREÇO DA OFERTA OCULTA NO CARRINHO MARCADO (`lib/ofertas/regras.ts`).
 *
 * O carrinho de quem pôs um produto na sacola pela página da oferta tem a
 * marca `fb_oferta` no `metadata` (só a loja escreve: `POST
 * /store/ofertas/carrinho`). Toda vez que o Medusa calcula o preço de uma
 * linha — ao adicionar, ao mudar a quantidade, e no refazer do carrinho
 * inteiro (quando a pessoa entra na conta, ou a rota da oferta pede) — este
 * gancho lê a marca e põe no contexto do preço. A lista de preço da oferta
 * tem a regra `fb_oferta` = o id dela: com a marca, o Medusa acha o preço
 * dela; sem, o de sempre.
 *
 * O GANCHO NÃO CONFERE SE A OFERTA VALE: quem confere é a própria lista
 * (começo, fim e rascunho, quando pausada). Marca de oferta que acabou não
 * acha preço nenhum, e a linha nova sai pelo preço da vitrine.
 *
 * UMA LEITURA A MAIS por escrita no carrinho (o `metadata` não vem no
 * carrinho que o Medusa entrega ao gancho). Se ela falhar, o carrinho não
 * quebra: a linha sai pelo preço da vitrine, e o log diz.
 */

async function contextoDaOferta(container: MedusaContainer, carrinho: string | undefined) {
  if (!carrinho) return {}
  try {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "cart",
      fields: ["metadata"],
      filters: { id: carrinho },
    })
    const marca = (data[0] as { metadata?: Record<string, unknown> | null } | undefined)
      ?.metadata?.[MARCA_DA_OFERTA]
    return typeof marca === "string" && ID_DA_OFERTA.test(marca) ? { [MARCA_DA_OFERTA]: marca } : {}
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[ofertas] a marca do carrinho ${carrinho} não veio, vai o preço da vitrine: ${e}`)
    return {}
  }
}

addToCartWorkflow.hooks.setPricingContext(async ({ cart }, { container }) => {
  return new StepResponse(await contextoDaOferta(container, (cart as { id?: string }).id))
})

updateLineItemInCartWorkflow.hooks.setPricingContext(async ({ cart }, { container }) => {
  return new StepResponse(await contextoDaOferta(container, (cart as { id?: string }).id))
})

refreshCartItemsWorkflow.hooks.setPricingContext(async ({ cart_id }, { container }) => {
  return new StepResponse(await contextoDaOferta(container, cart_id))
})
