import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { confirmarPedido, pedidoDoPagamento } from "../lib/confirmar-pedido"
import { registrarNoParceiro } from "../lib/envios/registro"

/**
 * Roda NO WORKER toda vez que um pagamento é capturado (Pix pago, cartão
 * aprovado — ver o `pedido-pago-na-hora.ts`).
 *
 * Hoje, nesta ordem:
 *   1. o e-mail de pedido confirmado (`lib/confirmar-pedido.ts`), na hora.
 *      Se ele falhar aqui, a varredura de 5 em 5 minutos manda depois;
 *   2. o pedido no painel da Frenet (`lib/envios/registro.ts`), pra etiqueta
 *      sair sem ninguém digitar — só com o token de parceiro; sem ele, não
 *      faz nada. Se falhar, a varredura de 10 em 10 minutos tenta de novo.
 *      Um não espera o outro dar certo: são dois `try`.
 *
 * O que ainda vem pra cá, na fase 5:
 *   - emitir a NF-e no Bling
 *   - enviar o `purchase` pra Meta (Conversions API) e pro GA4 (Measurement
 *     Protocol) com o client_id gravado no pedido — nunca pela tela de obrigado
 *
 * O MESMO PAGAMENTO PODE PASSAR AQUI MAIS DE UMA VEZ: o aviso do Pagar.me e a
 * conciliação chegam pelo mesmo caminho, e um Pix pago dispara os dois. O
 * Medusa não captura duas vezes, mas o evento sai de novo. Por isso cada
 * coisa que sai daqui é idempotente pelo pedido — o e-mail já é; nota fiscal
 * emitida duas vezes é problema com a Receita. E o "Check status" do admin
 * captura SEM soltar este evento: o que não pode faltar precisa da mesma
 * varredura que o e-mail tem.
 */
export default async function pagamentoCapturado({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const pedidoId = await pedidoDoPagamento(container, data.id)
    if (!pedidoId) {
      logger.info(`[pedido] pagamento ${data.id} capturado sem pedido — nada a confirmar`)
      return
    }
    try {
      await confirmarPedido(container, pedidoId)
    } catch (e) {
      logger.warn(
        `[pedido] a confirmação do pagamento ${data.id} ficou pra varredura: ` +
          (e instanceof Error ? e.message : String(e))
      )
    }
    try {
      await registrarNoParceiro(container, pedidoId)
    } catch (e) {
      logger.warn(
        `[envio] o pedido ${pedidoId} ficou pra varredura do painel do parceiro: ` +
          (e instanceof Error ? e.message : String(e))
      )
    }
  } catch (e) {
    logger.warn(
      `[pedido] o pagamento ${data.id} foi capturado, e o pedido dele não foi achado agora ` +
        `(${e instanceof Error ? e.message : String(e)}) — as varreduras cuidam dele`
    )
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
