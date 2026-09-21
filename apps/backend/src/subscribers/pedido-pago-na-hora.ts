import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules, PaymentEvents } from "@medusajs/framework/utils"

/**
 * CARTÃO APROVADO NA HORA TAMBÉM AVISA QUE FOI PAGO.
 *
 * O `payment.captured` é o gancho da fase 5 (nota fiscal, e-mail de
 * pagamento confirmado, `purchase` pro GA4 e pra Meta — ver
 * `pagamento-capturado.ts`). E o Medusa só emite esse evento quando a
 * captura passa pelo fluxo de captura: é o caso do Pix, pago depois, pelo
 * aviso do Pagar.me ou pela conciliação.
 *
 * O cartão aprovado no checkout NÃO passa por lá. O provedor responde
 * "capturado" dentro do fechamento do carrinho, o Medusa registra o
 * pagamento já capturado — e nenhum evento sai. Medido: pedido pago no
 * cartão, zero `payment.captured` no log. O aviso `order.paid` que o Pagar.me
 * manda em seguida acabaria emitindo, mas aí a nota fiscal de toda venda no
 * cartão dependeria de um webhook chegar.
 *
 * Então, quando o pedido nasce (`order.placed`, que o Medusa só solta depois
 * de o fechamento dar certo), este subscriber emite o evento pros pagamentos
 * que já nasceram capturados. Se o aviso do Pagar.me chegar depois, o evento
 * sai de novo — e é por isso que quem escuta precisa ser idempotente.
 *
 * Roda no worker, FORA do fechamento: se falhar, o pedido e o pagamento
 * continuam de pé — o que falta é só o aviso, e o log diz qual.
 */
export default async function pedidoPagoNaHora({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: ["id", "payment_collections.payments.id", "payment_collections.payments.captured_at"],
    filters: { id: data.id },
  })

  const capturados = (pedidos[0]?.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.captured_at))
  if (!capturados.length) return

  const eventos = container.resolve(Modules.EVENT_BUS)
  await eventos.emit(capturados.map((p) => ({ name: PaymentEvents.CAPTURED, data: { id: p.id } })))
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
