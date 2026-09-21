import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fecharCobrancasDoPedido } from "../lib/conciliar-pagamentos"

/**
 * PEDIDO CANCELADO FECHA A COBRANÇA NO PAGAR.ME, na hora.
 *
 * O Medusa, ao cancelar um pedido, estorna o que ele SABE que foi pago — o
 * cartão aprovado, o Pix já registrado — pelo `refundPayment` do provedor. O
 * que ele não sabe é o Pix ESPERANDO: pra ele, é uma sessão pendente, sem
 * pagamento, e o cancelamento não chama o provedor pra ela. O QR continuaria
 * pagável no celular do cliente, pra um pedido que não existe mais, e o
 * dinheiro entraria sem estoque reservado.
 *
 * Este subscriber fecha lá assim que o pedido é cancelado: o Pix pendente é
 * cancelado (o QR morre), o cartão em análise também, e o que tiver sido pago
 * sem o Medusa saber (o aviso ainda no caminho) é estornado. Vale pro
 * cancelamento no admin e pro da própria conciliação — neste, a cobrança já
 * foi fechada antes, e a releitura só confirma.
 *
 * Se falhar (Pagar.me fora do ar), não trava o cancelamento, que já
 * aconteceu: a conciliação de 5 em 5 minutos olha toda sessão pendente de
 * pedido cancelado e fecha a cobrança dela.
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
