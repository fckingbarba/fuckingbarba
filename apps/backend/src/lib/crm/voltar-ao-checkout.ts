import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { addToCartWorkflow, createCartWorkflow } from "@medusajs/medusa/core-flows"
import { gravarNoMetadataDoPedido } from "../metadata-do-pedido"
import type { Volta } from "./voltar"

/**
 * O QUE O LINK DE VOLTAR ABRE (`lib/crm/voltar.ts`, `POST /store/crm/voltar`):
 *
 *   - o CARRINHO do checkout abandonado, se ainda está aberto e tem produto;
 *   - o PEDIDO do Pix que venceu: um carrinho novo com os mesmos produtos, o
 *     mesmo e-mail e os mesmos endereços (com o CPF), pra pessoa cair direto
 *     na escolha do frete e do pagamento. Clicar duas vezes devolve o mesmo
 *     carrinho, enquanto ele estiver aberto (`fb_crm_refeito`, no pedido).
 *
 * Produto que esgotou fica de fora; se nenhum couber, "acabou" — a loja
 * manda pra home. Pedido que não foi cancelado (pago, ou com o Pix ainda
 * valendo) também é "acabou": não se refaz o que está de pé.
 */

export type Destino = { carrinho: string } | { acabou: true }

const ACABOU: Destino = { acabou: true }
const REFEITO = "fb_crm_refeito"

type Endereco = Record<string, unknown> | null | undefined

/** O endereço como o carrinho novo recebe: os campos, sem o id nem as datas do antigo. */
function copiaDo(e: Endereco) {
  if (!e) return undefined
  const campos = [
    "first_name",
    "last_name",
    "company",
    "address_1",
    "address_2",
    "city",
    "province",
    "postal_code",
    "country_code",
    "phone",
    "metadata",
  ] as const
  return Object.fromEntries(campos.flatMap((c) => (e[c] == null ? [] : [[c, e[c]]])))
}

async function carrinhoAberto(container: MedusaContainer, id: string): Promise<boolean> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: ["id", "completed_at", "items.id"],
    filters: { id },
  })
  const c = data[0] as { completed_at?: unknown; items?: unknown[] | null } | undefined
  return Boolean(c && !c.completed_at && c.items?.length)
}

export async function voltarAoCheckout(
  container: MedusaContainer,
  volta: Volta,
  agora = new Date()
): Promise<Destino> {
  if (volta.tipo === "carrinho")
    return (await carrinhoAberto(container, volta.id)) ? { carrinho: volta.id } : ACABOU

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "email",
      "region_id",
      "sales_channel_id",
      "customer_id",
      "metadata",
      // `items.*`, e não `items.quantity`: no Medusa 2.21 a quantidade do item do pedido é
      // calculada, e o campo sozinho volta vazio (o mesmo do "0×" dos e-mails, entrega 0116).
      "items.*",
      "shipping_address.*",
      "billing_address.*",
    ],
    filters: { id: volta.id },
  })
  const p = data[0] as
    | {
        id: string
        status: string
        email?: string | null
        region_id?: string | null
        sales_channel_id?: string | null
        customer_id?: string | null
        metadata?: Record<string, unknown> | null
        items?: { variant_id?: string | null; quantity?: number | null }[] | null
        shipping_address?: Endereco
        billing_address?: Endereco
      }
    | undefined
  if (!p || p.status !== "canceled") return ACABOU

  const antes = (p.metadata?.[REFEITO] as { carrinho?: unknown } | undefined)?.carrinho
  if (typeof antes === "string" && (await carrinhoAberto(container, antes)))
    return { carrinho: antes }

  const itens = (p.items ?? []).flatMap((i) =>
    i.variant_id
      ? [{ variant_id: i.variant_id, quantity: Math.max(1, Number(i.quantity) || 1) }]
      : []
  )
  if (!itens.length) return ACABOU
  const novo = {
    ...(p.region_id ? { region_id: p.region_id } : {}),
    ...(p.sales_channel_id ? { sales_channel_id: p.sales_channel_id } : {}),
    ...(p.customer_id ? { customer_id: p.customer_id } : {}),
    ...(p.email ? { email: p.email } : {}),
    shipping_address: copiaDo(p.shipping_address),
    billing_address: copiaDo(p.billing_address),
  }

  let carrinho: string | null = null
  try {
    const { result } = await createCartWorkflow(container).run({
      input: { ...novo, items: itens } as never,
    })
    carrinho = (result as { id: string }).id
  } catch {
    // Algum produto esgotou (ou saiu da loja): o carrinho nasce vazio, e entra um por vez o que couber.
    const { result } = await createCartWorkflow(container).run({ input: novo as never })
    carrinho = (result as { id: string }).id
    let entrou = 0
    for (const item of itens) {
      try {
        await addToCartWorkflow(container).run({
          input: { cart_id: carrinho, items: [item] } as never,
        })
        entrou++
      } catch {
        // Fica de fora.
      }
    }
    if (!entrou) return ACABOU
  }
  await gravarNoMetadataDoPedido(container, p.id, REFEITO, {
    carrinho,
    em: agora.toISOString(),
  })
  return { carrinho }
}
