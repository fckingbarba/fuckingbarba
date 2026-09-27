import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { devolverUsoDosCupons } from "../lib/uso-dos-cupons"

/**
 * OS CUPONS QUE PEDIDO CANCELADO JÁ TINHA QUEIMADO VOLTAM — roda UMA vez,
 * sozinho, no `medusa db:migrate` do deploy (entrega 0136).
 *
 * Até esta entrega, o uso do cupom não voltava no cancelamento (ver
 * `lib/uso-dos-cupons.ts`). Daqui pra frente o subscriber devolve; isto
 * devolve o dos pedidos que já estavam cancelados. Cada pedido passa pela
 * mesma porta (o registro no metadata antes, na trava), então rodar de novo
 * não devolve em dobro. Pedido sem cupom não muda nada.
 */
export default async function usoDosCuponsCancelados({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { status: "canceled" },
  })
  let devolvidos = 0
  for (const { id } of data as { id: string }[]) {
    try {
      const r = await devolverUsoDosCupons(container, id)
      if (r.resultado === "devolveu") {
        devolvidos++
        logger.info(
          `[cupons] pedido ${id} (cancelado antes): o uso voltou (${r.codigos.join(", ")})`
        )
      }
    } catch (e) {
      logger.warn(
        `[cupons] pedido ${id} (cancelado antes): o uso não voltou ` +
          `(${e instanceof Error ? e.message : String(e)})`
      )
    }
  }
  logger.info(
    `[cupons] pedidos cancelados: ${devolvidos} de ${data.length} devolveram uso de cupom`
  )
}
