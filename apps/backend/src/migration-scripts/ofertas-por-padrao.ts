import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { ofertasPorPadrao } from "../lib/ofertas-por-padrao"
import { normalizarEmail } from "../modules/codigo/regras"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"

/**
 * AS OFERTAS POR E-MAIL LIGADAS POR PADRÃO PROS CLIENTES DE ANTES — roda UMA
 * vez, sozinho, no `medusa db:migrate` do deploy (entrega 0184). Quem compra
 * ou cria conta daqui pra frente já entra assim
 * (`subscribers/ofertas-por-padrao.ts`); este é o de antes da regra: quem
 * tem conta ou pedido, não tem o sim e não saiu da lista ganha o sim com a
 * data do cadastro e a origem "padrao" (`ofertasPorPadrao`). Quem só digitou
 * o e-mail no checkout e não comprou fica como está.
 */
export default async function ofertasPorPadraoNosDeAntes({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const [todos, { data: pedidos }] = await Promise.all([
    container
      .resolve(Modules.CUSTOMER)
      .listCustomers(
        {},
        { select: ["id", "email", "metadata", "created_at", "has_account"], take: 100_000 }
      ),
    container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["customer_id"],
      pagination: { take: 100_000 },
    }),
  ])
  const compraram = new Set(
    (pedidos as { customer_id?: string | null }[]).flatMap((p) =>
      p.customer_id ? [p.customer_id] : []
    )
  )
  const clientes = todos.filter((c) => c.has_account || compraram.has(c.id))
  const emails = clientes.flatMap((c) => {
    const email = normalizarEmail(c.email)
    return email ? [email] : []
  })
  const saidas = await container.resolve<CrmService>(CRM).quemSaiu(emails)
  let ligados = 0
  for (const c of clientes) {
    const email = normalizarEmail(c.email)
    if (!email) continue
    const ofertas = ofertasPorPadrao(c.metadata, new Date(c.created_at), saidas.has(email))
    if (!ofertas) continue
    await updateCustomersWorkflow(container).run({
      input: { selector: { id: c.id }, update: { metadata: { ofertas } } },
    })
    ligados++
  }
  logger.info(`[ofertas] ${ligados} de ${clientes.length} clientes com o sim por padrão`)
}
