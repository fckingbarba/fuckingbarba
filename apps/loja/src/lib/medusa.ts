import "server-only"
import Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"

/**
 * Único ponto de contato com o Medusa. Regras:
 *
 * 1. Só roda no servidor (`server-only`): a chave publicável é pública por
 *    natureza, mas a URL do backend e o desenho das consultas não precisam
 *    estar no bundle do navegador.
 * 2. Toda leitura de catálogo é `use cache` com tag. O Medusa avisa a rota
 *    /api/revalidar quando um produto muda e a tag cai — é isso que deixa a
 *    vitrine servida do CDN sem ficar velha.
 * 3. Sem backend configurado, as funções devolvem vazio em vez de quebrar o
 *    build: a fase 1 sobe na Vercel antes de o Railway existir.
 */

const baseUrl = process.env.MEDUSA_BACKEND_URL
const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

export const medusaConfigurado = Boolean(baseUrl && publishableKey)

const sdk = medusaConfigurado ? new Medusa({ baseUrl: baseUrl!, publishableKey }) : null

export const TAGS = {
  produtos: "produtos",
  produto: (handle: string) => `produto:${handle}`,
  categorias: "categorias",
  categoria: (handle: string) => `categoria:${handle}`,
  regioes: "regioes",
} as const

/** Campos que a vitrine precisa; o resto fica no servidor. */
const CAMPOS_PRODUTO =
  "id,title,handle,subtitle,description,thumbnail,weight,length,height,width," +
  "*images,*categories,*variants,*variants.calculated_price,*variants.inventory_quantity"

function aviso(erro: unknown, contexto: string) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.warn(`[medusa] ${contexto}: ${msg}`)
}

export async function regiaoBrasil(): Promise<HttpTypes.StoreRegion | null> {
  "use cache"
  cacheTag(TAGS.regioes)
  cacheLife("days")
  if (!sdk) return null
  try {
    const { regions } = await sdk.store.region.list({ limit: 10 })
    return regions.find((r) => r.currency_code === "brl") ?? regions[0] ?? null
  } catch (e) {
    aviso(e, "regiões")
    return null
  }
}

export async function listarCategorias(): Promise<HttpTypes.StoreProductCategory[]> {
  "use cache"
  cacheTag(TAGS.categorias)
  cacheLife("hours")
  if (!sdk) return []
  try {
    const { product_categories } = await sdk.store.category.list({
      fields: "id,name,handle,description,rank",
      limit: 50,
    })
    return product_categories
  } catch (e) {
    aviso(e, "categorias")
    return []
  }
}

export async function buscarCategoria(
  handle: string
): Promise<HttpTypes.StoreProductCategory | null> {
  "use cache"
  cacheTag(TAGS.categorias, TAGS.categoria(handle))
  cacheLife("hours")
  if (!sdk) return null
  try {
    const { product_categories } = await sdk.store.category.list({
      handle,
      fields: "id,name,handle,description",
      limit: 1,
    })
    return product_categories[0] ?? null
  } catch (e) {
    aviso(e, `categoria ${handle}`)
    return null
  }
}

export async function listarProdutos(
  opcoes: {
    categoriaId?: string
    limite?: number
  } = {}
): Promise<HttpTypes.StoreProduct[]> {
  "use cache"
  cacheTag(TAGS.produtos, ...(opcoes.categoriaId ? [TAGS.categoria(opcoes.categoriaId)] : []))
  cacheLife("hours")
  if (!sdk) return []
  try {
    const regiao = await regiaoBrasil()
    const { products } = await sdk.store.product.list({
      fields: CAMPOS_PRODUTO,
      limit: opcoes.limite ?? 48,
      region_id: regiao?.id,
      ...(opcoes.categoriaId ? { category_id: [opcoes.categoriaId] } : {}),
    })
    return products
  } catch (e) {
    aviso(e, "produtos")
    return []
  }
}

export async function buscarProdutoPorHandle(
  handle: string
): Promise<HttpTypes.StoreProduct | null> {
  "use cache"
  cacheTag(TAGS.produtos, TAGS.produto(handle))
  cacheLife("hours")
  if (!sdk) return null
  try {
    const regiao = await regiaoBrasil()
    const { products } = await sdk.store.product.list({
      handle,
      fields: CAMPOS_PRODUTO,
      limit: 1,
      region_id: regiao?.id,
    })
    return products[0] ?? null
  } catch (e) {
    aviso(e, `produto ${handle}`)
    return null
  }
}

/** Preço em reais formatado, a partir do menor preço calculado das variantes. */
export function precoDe(produto: HttpTypes.StoreProduct): string | null {
  const valores = (produto.variants ?? [])
    .map((v) => v.calculated_price?.calculated_amount)
    .filter((n): n is number => typeof n === "number")
  if (!valores.length) return null
  return formatarReais(Math.min(...valores))
}

export function formatarReais(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
}
