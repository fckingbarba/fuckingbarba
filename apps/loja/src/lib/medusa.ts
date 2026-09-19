import "server-only"
import Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"
import { emReais } from "./formato"

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
  promocao: "promocao",
} as const

/** Campos que a vitrine precisa; o resto fica no servidor. */
const CAMPOS_PRODUTO =
  "id,title,handle,subtitle,description,thumbnail,weight,length,height,width," +
  "*images,*categories,*variants,*variants.calculated_price," +
  "+variants.inventory_quantity,+variants.manage_inventory"

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

export type Promocao = { titulo: string; termina_em: string }

/**
 * A promoção com prazo que está valendo, se houver.
 *
 * Vem de uma rota própria do Medusa (`/store/promocao`), porque a API de
 * produto devolve o preço promocional mas não diz até quando ele vale — e é a
 * data que o contador da vitrine precisa. Escrever essa data no código da
 * loja seria mais rápido e criaria a chance de o relógio zerar com o desconto
 * ainda valendo, ou o contrário. Aqui ela sai de onde o desconto mora.
 *
 * Cache curto: é o único dado da home que fica errado *por passagem de
 * tempo*, e não por alguém ter mudado algo no admin — então não dá pra
 * confiar só na invalidação por tag.
 */
export async function buscarPromocao(): Promise<Promocao | null> {
  "use cache"
  cacheTag(TAGS.promocao)
  cacheLife("minutes")
  if (!sdk) return null
  try {
    const { promocao } = await sdk.client.fetch<{ promocao: Promocao | null }>("/store/promocao")
    return promocao ?? null
  } catch (e) {
    aviso(e, "promoção")
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

/**
 * Os dois preços de um produto, em reais: o que se paga e o cheio riscado.
 *
 * `cheio` só existe quando há promoção valendo — é o `original_price` que o
 * Medusa devolve quando a variação está numa lista de preço do tipo "sale".
 * Sem promoção ele vem igual ao atual, e aqui vira `null`: riscar um preço
 * igual ao que se paga é mentira de vitrine.
 */
export function precosDe(
  produto: HttpTypes.StoreProduct
): { atual: number; cheio: number | null } | null {
  const variantes = (produto.variants ?? []).filter(
    (v) => typeof v.calculated_price?.calculated_amount === "number"
  )
  if (!variantes.length) return null

  const maisBarata = variantes.reduce((a, b) =>
    a.calculated_price!.calculated_amount! <= b.calculated_price!.calculated_amount! ? a : b
  )
  const preco = maisBarata.calculated_price!
  const atual = preco.calculated_amount!
  const original = preco.original_amount
  return {
    atual,
    cheio: typeof original === "number" && original > atual ? original : null,
  }
}

/**
 * Índice handle → produto, pra quem precisa cruzar uma lista de conteúdo com
 * o catálogo. Produto sem handle fica de fora: entrar no mapa com chave
 * `undefined` faria `get(undefined)` devolver um produto qualquer, que é o
 * tipo de bug que só aparece na tela do cliente.
 */
export function porHandle(
  produtos: HttpTypes.StoreProduct[]
): Map<string, HttpTypes.StoreProduct> {
  return new Map(produtos.flatMap((p) => (p.handle ? [[p.handle, p] as const] : [])))
}

/** Preço em reais já formatado, ou null quando o produto não tem preço. */
export function precoDe(produto: HttpTypes.StoreProduct): string | null {
  const precos = precosDe(produto)
  return precos ? emReais(precos.atual) : null
}
