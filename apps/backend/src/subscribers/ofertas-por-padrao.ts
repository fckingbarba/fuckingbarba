import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { ofertasPorPadrao } from "../lib/ofertas-por-padrao"
import { normalizarEmail } from "../modules/codigo/regras"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"

/**
 * QUEM COMPRA, CRIA CONTA OU DEIXA O E-MAIL NO CHECKOUT JÁ ENTRA COM AS
 * OFERTAS POR E-MAIL (entregas 0184 e 0205) — o padrão que o advogado do
 * dono pediu (`ofertasPorPadrao`, em `lib/ofertas-por-padrao.ts`). Três
 * momentos:
 *
 *   - `customer.created` da CONTA (o primeiro código): o cliente com conta;
 *   - `cart.created` e `cart.updated`: o cliente do carrinho. É o convidado
 *     que o checkout cria quando a pessoa digita o e-mail — esse nasce sem
 *     avisar "cliente criado" (o Medusa o cria dentro do carrinho). Quem
 *     digitou e não comprou também recebe (escolha do dono, 29/09): quer
 *     sair, sai no "Sair da lista" ou na conta;
 *   - `order.placed`: o cliente do pedido — a rede, se o carrinho falhou.
 *
 * Quem já saiu da lista antes não volta sozinho. Se não der, o cliente fica
 * como veio (sem o sim), e o log diz quem.
 */
export default async function ofertasNoCadastro({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    if (name === "order.placed") {
      const pedido = await container
        .resolve(Modules.ORDER)
        .retrieveOrder(data.id, { select: ["id", "customer_id"] })
      if (pedido.customer_id) await ligarAsOfertas(container, pedido.customer_id, false)
    } else if (name === "cart.created" || name === "cart.updated") {
      const carrinho = await container
        .resolve(Modules.CART)
        .retrieveCart(data.id, { select: ["id", "customer_id"] })
      if (carrinho.customer_id) await ligarAsOfertas(container, carrinho.customer_id, false)
    } else await ligarAsOfertas(container, data.id, true)
  } catch (e) {
    logger.warn(
      `[ofertas] ${name} ${data.id}: sem o sim por padrão (${e instanceof Error ? e.message : String(e)})`
    )
  }
}

async function ligarAsOfertas(container: MedusaContainer, id: string, soComConta: boolean) {
  const cliente = await container
    .resolve(Modules.CUSTOMER)
    .retrieveCustomer(id, { select: ["id", "email", "metadata", "created_at", "has_account"] })
  const email = normalizarEmail(cliente.email)
  if (!email || (soComConta && !cliente.has_account)) return
  // Quem já tem o sim para aqui, sem ir à lista de quem saiu: o carrinho
  // avisa a cada mudança, e quase sempre é de quem já tem.
  const desde = new Date(cliente.created_at)
  if (!ofertasPorPadrao(cliente.metadata, desde, false)) return
  const saiu = (await container.resolve<CrmService>(CRM).quemSaiu([email])).has(email)
  const ofertas = ofertasPorPadrao(cliente.metadata, desde, saiu)
  if (!ofertas) return
  // O Medusa junta o metadata no primeiro nível: só as `ofertas` mudam.
  await updateCustomersWorkflow(container).run({
    input: { selector: { id: cliente.id }, update: { metadata: { ofertas } } },
  })
}

export const config: SubscriberConfig = {
  event: ["customer.created", "cart.created", "cart.updated", "order.placed"],
}
