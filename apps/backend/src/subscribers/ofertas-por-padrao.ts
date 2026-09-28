import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { ofertasPorPadrao } from "../lib/ofertas-por-padrao"
import { normalizarEmail } from "../modules/codigo/regras"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"

/**
 * QUEM COMPRA OU CRIA CONTA JÁ ENTRA COM AS OFERTAS POR E-MAIL (entrega
 * 0184) — o padrão que o advogado do dono pediu (`ofertasPorPadrao`, em
 * `lib/ofertas-por-padrao.ts`). Dois momentos:
 *
 *   - `customer.created` da CONTA (o primeiro código): o cliente com conta;
 *   - `order.placed`: o cliente do pedido, que pode ser o convidado que o
 *     checkout criou — esse nasce sem avisar "cliente criado" (o Medusa o
 *     cria dentro do carrinho), e é na compra que ele vira cliente de fato.
 *
 * Quem só digitou o e-mail no checkout e não comprou não ganha nada. Quem já
 * saiu da lista antes não volta sozinho. Se não der, o cliente fica como
 * veio (sem o sim), e o log diz quem.
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
  const saiu = (await container.resolve<CrmService>(CRM).quemSaiu([email])).has(email)
  const ofertas = ofertasPorPadrao(cliente.metadata, new Date(cliente.created_at), saiu)
  if (!ofertas) return
  // O Medusa junta o metadata no primeiro nível: só as `ofertas` mudam.
  await updateCustomersWorkflow(container).run({
    input: { selector: { id: cliente.id }, update: { metadata: { ofertas } } },
  })
}

export const config: SubscriberConfig = {
  event: ["customer.created", "order.placed"],
}
