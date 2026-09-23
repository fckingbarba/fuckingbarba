import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { registrarNoParceiro } from "../lib/envios/registro"

/**
 * A NOTA FOI AUTORIZADA: o pedido vai pro painel do parceiro de entrega,
 * com ela junto (`lib/envios/registro.ts`). Com o ERP emitindo, é aqui que
 * o registro acontece — o `payment.captured` encontra o pedido "esperando a
 * nota". Sem o token de parceiro da Frenet, não faz nada.
 */
export default async function notaAutorizada({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    await registrarNoParceiro(container, data.id)
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[envio] o pedido ${data.id} ficou pra varredura do painel do parceiro: ` +
          (e instanceof Error ? e.message : String(e))
      )
  }
}

export const config: SubscriberConfig = {
  event: "erp.nota_autorizada",
}
