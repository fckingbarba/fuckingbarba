import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { acharListaDaPromocao } from "./gravar-promocao"
import { precoDo, type ProdutoCru } from "./produtos"
import { precoDoProduto, type PrecoDoProduto } from "./promocao"

/**
 * O QUE O PAINEL LÊ DOS PRODUTOS — o produto do Medusa e o estoque, que
 * mora em outro módulo (o de estoque, por item e por local). Só lê.
 */

const CAMPOS_DA_LISTA = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "images.url",
  "images.rank",
  "categories.id",
  "categories.name",
  "variants.id",
  "variants.sku",
  "variants.manage_inventory",
  "variants.price_set.id",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "variants.inventory_items.inventory_item_id",
  "variants.inventory_items.required_quantity",
]

const CAMPOS_DO_DETALHE = [
  ...CAMPOS_DA_LISTA,
  "subtitle",
  "description",
  "weight",
  "metadata",
  "categories.handle",
]

type ComEstoque = ProdutoCru

const query = (container: MedusaContainer) => container.resolve(ContainerRegistrationKeys.QUERY)

/** O metadata dos produtos, pelo id — o que a página de cada um guarda (`fb_pdp`). */
export async function metadataDos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, unknown>> {
  if (!ids.length) return new Map()
  const { data } = await query(container).graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: ids },
  })
  return new Map((data as { id: string; metadata: unknown }[]).map((p) => [p.id, p.metadata]))
}

/** Todos os produtos, o mais novo primeiro. A loja tem poucos: a lista vem inteira. */
export async function lerProdutos(container: MedusaContainer): Promise<ComEstoque[]> {
  const { data } = await query(container).graph({
    entity: "product",
    fields: CAMPOS_DA_LISTA,
    pagination: { take: 500, order: { created_at: "DESC" } },
  })
  return data as unknown as ComEstoque[]
}

export async function lerProduto(
  container: MedusaContainer,
  id: string
): Promise<ComEstoque | null> {
  const { data } = await query(container).graph({
    entity: "product",
    fields: CAMPOS_DO_DETALHE,
    filters: { id },
  })
  return ((data as unknown as ComEstoque[])[0] as ComEstoque | undefined) ?? null
}

export async function lerCategorias(
  container: MedusaContainer
): Promise<{ id: string; nome: string }[]> {
  const { data } = await query(container).graph({
    entity: "product_category",
    fields: ["id", "name", "rank"],
    pagination: { take: 100, order: { rank: "ASC" } },
  })
  return (data as { id: string; name?: string | null }[]).map((c) => ({
    id: c.id,
    nome: (c.name ?? "").trim() || "Sem nome",
  }))
}

/**
 * Quanto dá pra vender de cada produto: o guardado menos o reservado, em
 * todos os locais, variante por variante. Variante montada de vários itens
 * (kit do Medusa) vende o que o item mais curto deixa. `null`: o produto
 * não controla estoque (nenhuma variante com `manage_inventory`).
 */
export async function estoquesDos(
  container: MedusaContainer,
  produtos: ComEstoque[]
): Promise<Map<string, number | null>> {
  const ids = [
    ...new Set(
      produtos.flatMap((p) =>
        (p.variants ?? []).flatMap((v) =>
          v.manage_inventory
            ? (v.inventory_items ?? []).flatMap((i) =>
                i.inventory_item_id ? [i.inventory_item_id] : []
              )
            : []
        )
      )
    ),
  ]
  const livre = new Map<string, number>()
  if (ids.length) {
    const niveis = await container
      .resolve(Modules.INVENTORY)
      .listInventoryLevels(
        { inventory_item_id: ids },
        { select: ["inventory_item_id", "stocked_quantity", "reserved_quantity"], take: 5000 }
      )
    for (const n of niveis) {
      const aqui = Number(n.stocked_quantity ?? 0) - Number(n.reserved_quantity ?? 0)
      livre.set(n.inventory_item_id, (livre.get(n.inventory_item_id) ?? 0) + aqui)
    }
  }
  const porProduto = new Map<string, number | null>()
  for (const p of produtos) {
    const controladas = (p.variants ?? []).filter((v) => v.manage_inventory)
    if (!controladas.length) {
      porProduto.set(p.id, null)
      continue
    }
    let total = 0
    for (const v of controladas) {
      const itens = (v.inventory_items ?? []).filter((i) => i.inventory_item_id)
      if (!itens.length) continue
      const vende = Math.min(
        ...itens.map((i) =>
          Math.floor((livre.get(i.inventory_item_id!) ?? 0) / Math.max(1, i.required_quantity ?? 1))
        )
      )
      total += Math.max(0, vende)
    }
    porProduto.set(p.id, total)
  }
  return porProduto
}

/**
 * O preço de cada produto como a lista mostra (`precoDoProduto`): o do Bling,
 * o que a loja cobra hoje por uma unidade (o Medusa calcula, com as listas
 * de preço) e o da promoção do painel. Pela primeira variação, como o preço
 * da lista.
 */
export async function precosDos(
  container: MedusaContainer,
  produtos: ComEstoque[]
): Promise<Map<string, PrecoDoProduto>> {
  const conjuntoDe = new Map(
    produtos.flatMap((p) => {
      const conjunto = p.variants?.[0]?.price_set?.id
      return conjunto ? [[p.id, conjunto] as const] : []
    })
  )
  const conjuntos = [...new Set(conjuntoDe.values())]
  const pricing = container.resolve(Modules.PRICING)
  const [calculados, lista] = await Promise.all([
    conjuntos.length
      ? pricing.calculatePrices({ id: conjuntos }, { context: { currency_code: "brl" } })
      : Promise.resolve([]),
    acharListaDaPromocao(container),
  ])
  const naLista =
    lista && conjuntos.length
      ? await pricing.listPrices(
          { price_list_id: [lista.id], price_set_id: conjuntos },
          { select: ["price_set_id", "amount", "currency_code"], take: 5000 }
        )
      : []
  const numero = (v: unknown) => {
    const n = Number(v)
    return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : null
  }
  const vale = new Map(calculados.map((c) => [c.id, numero(c.calculated_amount)]))
  const doPainel = new Map(
    naLista
      .filter((p) => p.currency_code?.toLowerCase() === "brl")
      .map((p) => [p.price_set_id, numero(p.amount)])
  )
  return new Map(
    produtos.map((p) => {
      const conjunto = conjuntoDe.get(p.id)
      return [
        p.id,
        precoDoProduto({
          de: precoDo(p),
          vale: conjunto ? (vale.get(conjunto) ?? null) : null,
          doPainel: conjunto ? (doPainel.get(conjunto) ?? null) : null,
        }),
      ]
    })
  )
}
