import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Roda NO WORKER toda vez que um pagamento é capturado (Pix pago, cartão
 * aprovado). É o ponto de partida da fase 5:
 *
 *   - emitir a NF-e no Bling
 *   - disparar o e-mail "pagamento confirmado" pelo Resend
 *   - enviar o `purchase` pra Meta (Conversions API) e pro GA4 (Measurement
 *     Protocol) com o client_id gravado no pedido — nunca pela tela de obrigado
 *
 * Na fase 1 ele só registra no log, pra você ver o evento passando pelo
 * worker no Railway e confirmar que a fila (Redis) está viva.
 *
 * O MESMO PAGAMENTO PODE PASSAR AQUI MAIS DE UMA VEZ: o aviso do Pagar.me e a
 * conciliação chegam pelo mesmo caminho, e um Pix pago dispara os dois. O
 * Medusa não captura duas vezes, mas o evento sai de novo. Quando a fase 5
 * ligar nota, e-mail e conversão aqui, cada um precisa ser idempotente pelo
 * id do pagamento — nota fiscal emitida duas vezes é problema com a Receita.
 */
export default async function pagamentoCapturado({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(
    `[worker] pagamento capturado: ${data.id} — fase 5 liga NF-e, e-mail e conversões aqui`
  )
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
