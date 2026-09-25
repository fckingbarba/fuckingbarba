import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { contextoDosCupons, type PedidoDoEmail } from "../../lib/cupons"
import type { LinhaDoCarrinho } from "../../modules/frenet/client"

/**
 * O QUE AS REGRAS DOS CUPONS LEEM E O CARRINHO NÃO TEM — a soma dos
 * produtos, a hora, quantos pedidos o e-mail já fez e que cupons ele já usou
 * (o porquê está em `lib/cupons.ts`).
 *
 * Roda toda vez que o Medusa confere as promoções de um carrinho: quando
 * alguém digita um cupom, e a cada mudança (produto, quantidade, e-mail). O
 * que ele devolve é mesclado no contexto antes das regras — a porta oficial
 * do Medusa pra isso, a mesma do frete (`contexto-do-frete.ts`).
 *
 * Os pedidos do e-mail: uma consulta, só o status e os códigos. Sem e-mail
 * (a sacola antes do passo 1), nenhum pedido: "primeira compra" e "uma vez
 * por cliente" deixam aplicar, e o Medusa confere de novo quando o e-mail
 * chega.
 *
 * SE A CONSULTA FALHAR, O CARRINHO NÃO QUEBRA: o contexto sai sem o
 * histórico e sem a trava do `conferido`, e cupom com condição não aplica
 * naquela conta (a pessoa tenta de novo). A oferta do checkout e o resto do
 * carrinho seguem.
 */
updateCartPromotionsWorkflow.hooks.setPromotionContext(async ({ cart }, { container }) => {
  const c = cart as { id?: string; email?: string | null; items?: LinhaDoCarrinho[] | null }
  const email = typeof c.email === "string" ? c.email.trim() : ""
  let pedidos: PedidoDoEmail[] | null = []
  if (email) {
    try {
      pedidos = await pedidosDoEmail(container, email)
    } catch (e) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[cupons] o histórico do carrinho ${c.id} não veio: ${e}`)
      pedidos = null
    }
  }
  return new StepResponse(contextoDosCupons({ itens: c.items ?? [], pedidos, agora: Date.now() }))
})

/** O status e os códigos de cada pedido feito com este e-mail. */
async function pedidosDoEmail(
  container: { resolve: (chave: string) => unknown },
  email: string
): Promise<PedidoDoEmail[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: object) => Promise<{ data: unknown[] }>
  }
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "items.adjustments.code", "shipping_methods.adjustments.code"],
    filters: { email, is_draft_order: false },
  })
  return (
    data as {
      status?: string | null
      items?: { adjustments?: { code?: string | null }[] | null }[] | null
      shipping_methods?: { adjustments?: { code?: string | null }[] | null }[] | null
    }[]
  ).map((o) => ({
    status: o.status,
    codigos: [...(o.items ?? []), ...(o.shipping_methods ?? [])]
      .flatMap((l) => l.adjustments ?? [])
      .map((a) => a.code ?? "")
      .filter(Boolean),
  }))
}
