import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/pedido-do-carrinho/:id — o pedido que saiu deste carrinho.
 *
 *   { "pedido": "order_01…" }   ou   { "pedido": null }
 *
 * A loja pergunta quando a resposta do fechamento se perdeu no caminho: o
 * carrinho do cookie já virou pedido, mas o navegador nunca soube qual
 * (`/checkout/retomar`, e o segundo clique em "pagar").
 *
 * POR QUE NÃO O `complete` DE NOVO, que era o jeito até 24/09: o workflow do
 * Medusa (2.21) confere as sessões de pagamento ANTES de ver que o pedido já
 * existe. Com o pagamento cancelado — cartão reprovado na análise, Pix
 * vencido —, ele responde "Payment sessions are required to complete cart"
 * pra sempre, e a loja ficava sem ter pra onde mandar a pessoa. Aqui é só
 * uma leitura do elo carrinho → pedido, o mesmo que o workflow consulta.
 *
 * Não abre nada que já não estivesse aberto: quem tem o id do carrinho já lê
 * o pedido inteiro pelo `x-carrinho` (ver `lib/pedido-publico.ts`), e o id
 * do pedido sozinho só dá a versão pública.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order_cart",
    fields: ["order_id"],
    filters: { cart_id: req.params.id },
  })
  const pedido = (data[0] as { order_id?: string } | undefined)?.order_id
  res.json({ pedido: pedido ?? null })
}
