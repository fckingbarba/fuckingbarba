import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pedidoDoPagamento } from "../lib/confirmar-pedido"
import { premiarIndicacao } from "../lib/crm/premio-da-indicacao"

/**
 * O PRÊMIO DO INDIQUE UM BROTHER (entrega 0215) — no worker, toda vez que um
 * pagamento é capturado (o Pix pago, o cartão aprovado; ver o
 * `pedido-pago-na-hora.ts`): se o pedido veio com o cupom de um link
 * (`BROTHER-…`), quem indicou ganha o cupom de 15%
 * (`lib/crm/premio-da-indicacao.ts`). O aviso pode chegar duas vezes: o
 * registro reserva o prêmio, e o segundo não dá nada.
 *
 * Se falhar, o pedido e o pagamento continuam de pé — o log diz qual.
 */
export default async function premioDaIndicacao({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const pedido = await pedidoDoPagamento(container, data.id)
    if (!pedido) return
    const r = await premiarIndicacao(container, pedido)
    if (r === "premiado")
      logger.info(`[crm] indicação: o pedido ${pedido} deu o cupom de quem indicou`)
  } catch (e) {
    logger.warn(
      `[crm] indicação: o prêmio do pagamento ${data.id} não saiu (${e instanceof Error ? e.message : String(e)})`
    )
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
