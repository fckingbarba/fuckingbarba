import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fecharCobrancasDoPedido } from "../lib/conciliar-pagamentos"

/**
 * PEDIDO CANCELADO FECHA NO PAGAR.ME O QUE DÁ PRA FECHAR, na hora.
 *
 * O Medusa, ao cancelar um pedido, estorna o que ele SABE que foi pago — o
 * cartão aprovado, o Pix já registrado — pelo `refundPayment` do provedor. O
 * que ele não sabe é a cobrança que ficou aberta: pra ele, é uma sessão
 * pendente, sem pagamento, e o cancelamento não chama o provedor pra ela.
 *
 * Este subscriber cuida dessa ponta: o cartão em análise é cancelado, e o que
 * tiver sido pago sem o Medusa saber (o aviso ainda no caminho) é estornado.
 *
 * ┌─ O PIX ESPERANDO NÃO MORRE, E ISSO É DE PROPÓSITO ─────────────────────┐
 * │ O Pagar.me não cancela cobrança de Pix pendente — responde 412, e Pix  │
 * │ vencido continua `pending` lá. Tentar só rendia erro a cada rodada e   │
 * │ estoque preso (foi o #7).                                             │
 * │                                                                        │
 * │ Então o QR continua pagável até vencer, e a sessão fica VIGIADA. Se o  │
 * │ cliente pagar um pedido que não existe mais, o dinheiro entra e a      │
 * │ conciliação devolve: é a varredura de "pago depois de cancelado", em   │
 * │ `lib/conciliar-pagamentos.ts`.                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Se falhar (Pagar.me fora do ar), não trava o cancelamento, que já
 * aconteceu: a conciliação de 5 em 5 minutos olha toda sessão pendente de
 * pedido cancelado e faz o mesmo.
 */
export default async function pedidoCancelado({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const r = await fecharCobrancasDoPedido(container, data.id)
    const partes = [
      r.canceladas.length && `cobrança cancelada no Pagar.me: ${r.canceladas.join(", ")}`,
      r.estornadas.length && `estornada: ${r.estornadas.join(", ")}`,
      r.avisos.length && `avisos: ${r.avisos.join(" | ")}`,
    ].filter(Boolean)
    if (partes.length) {
      logger.info(`[pagamento] pedido ${data.id} cancelado — ${partes.join("; ")}`)
    }
  } catch (e) {
    logger.warn(
      `[pagamento] pedido ${data.id} cancelado, e a cobrança dele no Pagar.me não foi fechada ` +
        `agora (${e instanceof Error ? e.message : String(e)}) — a conciliação tenta de novo.`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
