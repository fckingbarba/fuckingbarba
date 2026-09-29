import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { ofertasPorPadrao } from "../lib/ofertas-por-padrao"
import { normalizarEmail } from "../modules/codigo/regras"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"

/**
 * AS OFERTAS POR E-MAIL LIGADAS POR PADRÃO PRA QUEM SÓ DEIXOU O E-MAIL NO
 * CHECKOUT, DE ANTES — roda UMA vez, sozinho, no `medusa db:migrate` do
 * deploy (entrega 0205). A migração da 0184 (`ofertas-por-padrao.ts`) ligou
 * quem tinha conta ou pedido; este liga o resto: todo cliente com e-mail que
 * não tem o sim e não saiu da lista — na prática, o convidado que o checkout
 * criou e não comprou. Daqui pra frente, o carrinho liga sozinho
 * (`subscribers/ofertas-por-padrao.ts`).
 */
export default async function ofertasNoCheckoutNosDeAntes({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const todos = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({}, { select: ["id", "email", "metadata", "created_at"], take: 100_000 })
  // Só os sem o sim: quem já tem nem vai à lista de quem saiu.
  const clientes = todos.filter(
    (c) => normalizarEmail(c.email) && ofertasPorPadrao(c.metadata, new Date(c.created_at), false)
  )
  const saidas = await container
    .resolve<CrmService>(CRM)
    .quemSaiu(clientes.map((c) => normalizarEmail(c.email)!))
  let ligados = 0
  for (const c of clientes) {
    const email = normalizarEmail(c.email)!
    const ofertas = ofertasPorPadrao(c.metadata, new Date(c.created_at), saidas.has(email))
    if (!ofertas) continue
    await updateCustomersWorkflow(container).run({
      input: { selector: { id: c.id }, update: { metadata: { ofertas } } },
    })
    ligados++
  }
  logger.info(`[ofertas] ${ligados} de ${clientes.length} clientes sem o sim ligados (checkout)`)
}
