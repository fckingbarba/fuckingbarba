import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { addToCartWorkflow, createCartWorkflow } from "@medusajs/medusa/core-flows"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { gravarNoMetadataDoPedido } from "../metadata-do-pedido"
import { abrirEntrega, enderecosDaEntrega } from "./entrega-da-base"
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
 *   - o "REFAZER O PEDIDO" da reposição (entrega 0185): a última compra,
 *     paga, num carrinho novo — a da loja nova do mesmo jeito do Pix (com os
 *     endereços e a conta; `fb_crm_reposto`, no pedido), e a da Nuvemshop
 *     pelos SKUs, com o e-mail e, desde a 0202, a entrega daquele pedido (o
 *     nome, o celular, o CPF e o endereço, guardados cifrados na base): a
 *     pessoa cai na escolha do frete, sem digitar nada.
 *
 * Produto que esgotou fica de fora; se nenhum couber, "acabou" — a loja
 * manda pra home. No Pix, pedido que não foi cancelado (pago, ou com o Pix
 * ainda valendo) também é "acabou": não se refaz o que está de pé.
 */

export type Destino = { carrinho: string } | { acabou: true }

const ACABOU: Destino = { acabou: true }
const REFEITO = "fb_crm_refeito"
/** O carrinho do "Refazer o pedido" da reposição, no pedido: o mesmo, enquanto aberto. */
const REPOSTO = "fb_crm_reposto"

type Endereco = Record<string, unknown> | null | undefined

/** O endereço como o carrinho novo recebe: os campos, sem o id nem as datas do antigo. */
export function copiaDo(e: Endereco) {
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

export type PedidoCru = {
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

export async function lerPedido(
  container: MedusaContainer,
  id: string
): Promise<PedidoCru | undefined> {
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
    filters: { id },
  })
  return data[0] as PedidoCru | undefined
}

type Item = { variant_id: string; quantity: number }

/** Um carrinho novo com estes itens; o que esgotou fica de fora. Nulo se nenhum couber. */
export async function carrinhoNovo(
  container: MedusaContainer,
  novo: Record<string, unknown>,
  itens: Item[]
): Promise<string | null> {
  if (!itens.length) return null
  try {
    const { result } = await createCartWorkflow(container).run({
      input: { ...novo, items: itens } as never,
    })
    return (result as { id: string }).id
  } catch {
    // Algum produto esgotou (ou saiu da loja): o carrinho nasce vazio, e entra um por vez o que couber.
    const { result } = await createCartWorkflow(container).run({ input: novo as never })
    const carrinho = (result as { id: string }).id
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
    return entrou ? carrinho : null
  }
}

/**
 * O pedido da loja nova num carrinho novo: os mesmos produtos, o e-mail, os
 * endereços (com o CPF) e a conta. Clicar de novo devolve o mesmo carrinho,
 * enquanto ele estiver aberto (a `marca`, no pedido).
 */
async function refazerPedido(
  container: MedusaContainer,
  p: PedidoCru,
  marca: string,
  agora: Date
): Promise<Destino> {
  const antes = (p.metadata?.[marca] as { carrinho?: unknown } | undefined)?.carrinho
  if (typeof antes === "string" && (await carrinhoAberto(container, antes)))
    return { carrinho: antes }
  const itens = (p.items ?? []).flatMap((i) =>
    i.variant_id
      ? [{ variant_id: i.variant_id, quantity: Math.max(1, Number(i.quantity) || 1) }]
      : []
  )
  const carrinho = await carrinhoNovo(
    container,
    {
      ...(p.region_id ? { region_id: p.region_id } : {}),
      ...(p.sales_channel_id ? { sales_channel_id: p.sales_channel_id } : {}),
      ...(p.customer_id ? { customer_id: p.customer_id } : {}),
      ...(p.email ? { email: p.email } : {}),
      shipping_address: copiaDo(p.shipping_address),
      billing_address: copiaDo(p.billing_address),
    },
    itens
  )
  if (!carrinho) return ACABOU
  await gravarNoMetadataDoPedido(container, p.id, marca, {
    carrinho,
    em: agora.toISOString(),
  })
  return { carrinho }
}

/**
 * O pedido da Nuvemshop (a base do CRM) num carrinho novo: os produtos pelo
 * SKU (o código do Bling, o mesmo nas duas lojas), só os publicados, o
 * e-mail e a entrega do pedido (entrega 0202). Sem a entrega (o arquivo de
 * vendas de antes da 0202, ou o endereço que veio pela metade), o checkout
 * pergunta, como antes.
 */
async function refazerDaNuvemshop(container: MedusaContainer, id: string): Promise<Destino> {
  const pedido = await container.resolve<CrmService>(CRM).pedidoDaBasePorId(id)
  const doSku = (sku: string | null) => sku?.trim().toUpperCase() || null
  const skus = [...new Set((pedido?.itens ?? []).flatMap((i) => doSku(i.sku) ?? []))]
  if (!pedido || !skus.length) return ACABOU
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: variantes }, { data: regioes }, lojas] = await Promise.all([
    query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product.status"],
      filters: { sku: skus },
    }),
    query.graph({ entity: "region", fields: ["id", "currency_code"] }),
    container
      .resolve(Modules.STORE)
      .listStores({}, { select: ["default_sales_channel_id"], take: 1 }),
  ])
  const porSku = new Map(
    (variantes as { id: string; sku?: string | null; product?: { status?: string } | null }[])
      .filter((v) => v.sku && v.product?.status === "published")
      .map((v) => [doSku(v.sku!)!, v.id])
  )
  const quantos = new Map<string, number>()
  for (const i of pedido.itens) {
    const variante = porSku.get(doSku(i.sku) ?? "")
    if (variante)
      quantos.set(variante, (quantos.get(variante) ?? 0) + Math.max(1, Number(i.quantidade) || 1))
  }
  const regiao = (regioes as { id: string; currency_code?: string | null }[]).find(
    (r) => r.currency_code === "brl"
  )
  const canal = lojas[0]?.default_sales_channel_id
  const entrega = abrirEntrega(pedido.entrega)
  const carrinho = await carrinhoNovo(
    container,
    {
      ...(regiao ? { region_id: regiao.id } : {}),
      ...(canal ? { sales_channel_id: canal } : {}),
      email: pedido.email,
      ...(entrega ? enderecosDaEntrega(entrega) : {}),
    },
    [...quantos].map(([variant_id, quantity]) => ({ variant_id, quantity }))
  )
  return carrinho ? { carrinho } : ACABOU
}

export async function voltarAoCheckout(
  container: MedusaContainer,
  volta: Volta,
  agora = new Date()
): Promise<Destino> {
  if (volta.tipo === "carrinho")
    return (await carrinhoAberto(container, volta.id)) ? { carrinho: volta.id } : ACABOU
  if (volta.tipo === "repor" && volta.id.startsWith("nso_"))
    return refazerDaNuvemshop(container, volta.id)
  const p = await lerPedido(container, volta.id)
  if (!p) return ACABOU
  // O Pix que venceu só se refaz cancelado; a reposição refaz a compra paga de antes.
  if (volta.tipo === "pedido")
    return p.status === "canceled" ? refazerPedido(container, p, REFEITO, agora) : ACABOU
  return refazerPedido(container, p, REPOSTO, agora)
}
