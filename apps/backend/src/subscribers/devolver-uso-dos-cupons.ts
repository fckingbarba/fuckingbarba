import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { devolverUsoDosCupons } from "../lib/uso-dos-cupons"

/**
 * PEDIDO CANCELADO DEVOLVE O USO DO CUPOM — o Pix que venceu sem ser pago
 * não queima mais o cupom de 1 uso (ver `lib/uso-dos-cupons.ts`).
 *
 * À parte do `pedido-cancelado.ts` (cobrança, e-mail, parceiro e nota): o
 * cupom é outra conta, e a falha de uma não segura a outra. Se não der, o
 * cancelamento já aconteceu; o log diz o pedido, e o uso fica como estava.
 */
export default async function devolverUsoDoCupom({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const r = await devolverUsoDosCupons(container, data.id)
    if (r.resultado === "devolveu") {
      logger.info(`[cupons] pedido ${data.id} cancelado: o uso voltou (${r.codigos.join(", ")})`)
    }
  } catch (e) {
    logger.warn(
      `[cupons] pedido ${data.id} cancelado, e o uso do cupom não voltou ` +
        `(${e instanceof Error ? e.message : String(e)})`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
