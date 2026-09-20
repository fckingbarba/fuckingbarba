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

/**
 * O mesmo cliente, pro carrinho (`lib/carrinho.ts`).
 *
 * O carrinho não mora aqui porque este arquivo é só leitura cacheada, e
 * carrinho é escrita por pessoa — as duas coisas têm regras opostas de cache
 * e misturar as duas num arquivo é como uma acaba herdando a regra da outra.
 * O que elas compartilham de verdade é só a conexão.
 */
export function cliente() {
  return sdk
}

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
  "id,title,handle,subtitle,description,thumbnail,weight,length,height,width,metadata," +
  "*images,*categories,*variants,*variants.calculated_price," +
  "+variants.inventory_quantity,+variants.manage_inventory"

/**
 * OS KITS DE QUANTIDADE
 *
 * "2 frascos" e "3 frascos" são produtos de verdade no Medusa, com SKU e
 * estoque próprios (ver `backend/src/scripts/kits-de-quantidade.ts`). O que
 * os amarra ao avulso é a metadata, e ela faz dois trabalhos aqui:
 *
 *   sumir da vitrine — uma grade com "Fator", "Fator 2x" e "Fator 3x" lado
 *     a lado é péssima vitrine, e o cliente não está escolhendo entre três
 *     produtos: está escolhendo quanto comprar de um;
 *   montar o degrau na PDP — que passa a sair do CATÁLOGO, não de uma lista
 *     escrita no código. Criar um kit de 4 no admin com essa metadata faz
 *     ele aparecer na página sozinho, sem deploy.
 */
const TIPO_KIT = "kit-quantidade"

type MetaDeKit = { tipo?: unknown; base?: unknown; unidades?: unknown }

export function ehKitDeQuantidade(produto: HttpTypes.StoreProduct): boolean {
  return (produto.metadata as MetaDeKit | null)?.tipo === TIPO_KIT
}

/** Só os produtos que uma listagem deve mostrar. */
function semKits(produtos: HttpTypes.StoreProduct[]): HttpTypes.StoreProduct[] {
  return produtos.filter((p) => !ehKitDeQuantidade(p))
}

/**
 * O Medusa não filtra por metadata, então a peneira dos kits é sempre aqui,
 * DEPOIS de a página chegar. Isso quebra a conta de "pedi 8, recebi 8": se a
 * página vier cheia de kit, a vitrine fica curta sem ninguém perceber.
 *
 * Daí o laço: pede uma página com folga, peneira, e só volta pra buscar mais
 * se (a) ainda falta produto e (b) a página veio cheia — se veio pela metade,
 * o catálogo acabou e insistir só gera requisição vazia. O teto de páginas
 * existe pra que um bug de paginação do outro lado não vire laço infinito
 * numa requisição de usuário.
 */
const MAX_PAGINAS = 5

async function paginarSemKits(
  params: Record<string, unknown>,
  limite: number
): Promise<HttpTypes.StoreProduct[]> {
  const tamanho = limite + 12
  const coletados: HttpTypes.StoreProduct[] = []
  let offset = 0

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const { products } = await sdk!.store.product.list({ ...params, limit: tamanho, offset })
    coletados.push(...semKits(products))
    offset += products.length
    if (coletados.length >= limite || products.length < tamanho) break
  }

  return coletados.slice(0, limite)
}

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
    return await paginarSemKits(
      {
        fields: CAMPOS_PRODUTO,
        region_id: regiao?.id,
        ...(opcoes.categoriaId ? { category_id: [opcoes.categoriaId] } : {}),
      },
      opcoes.limite ?? 48
    )
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
export function porHandle(produtos: HttpTypes.StoreProduct[]): Map<string, HttpTypes.StoreProduct> {
  return new Map(produtos.flatMap((p) => (p.handle ? [[p.handle, p] as const] : [])))
}

/** Preço em reais já formatado, ou null quando o produto não tem preço. */
export function precoDe(produto: HttpTypes.StoreProduct): string | null {
  const precos = precosDe(produto)
  return precos ? emReais(precos.atual) : null
}

const emCentavos = (n: number) => Math.round(n * 100) / 100

export type DegrauDeQuantidade = {
  /** handle do produto a comprar — pode ser o próprio avulso (1 unidade) */
  handle: string
  varianteId: string
  unidades: number
  /** preço total deste degrau, em reais */
  preco: number
  /** preço por frasco, pra deixar a comparação na cara */
  porUnidade: number
  /** quanto se economiza contra comprar `unidades` avulsos. 0 no primeiro degrau */
  economia: number
  disponivel: boolean
}

/**
 * Todos os kits do catálogo, uma vez só.
 *
 * Separado de `escadaDeQuantidade` porque é a MESMA lista pra qualquer
 * produto: uma PDP de óleo e uma de fator leem o mesmo resultado cacheado em
 * vez de cada uma varrer o catálogo por conta. Como kit é minoria (dois hoje),
 * o laço quase sempre resolve na primeira página.
 */
async function kitsDoCatalogo(): Promise<HttpTypes.StoreProduct[]> {
  "use cache"
  cacheTag(TAGS.produtos)
  cacheLife("hours")
  if (!sdk) return []

  try {
    const regiao = await regiaoBrasil()
    const kits: HttpTypes.StoreProduct[] = []
    let offset = 0

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { products } = await sdk.store.product.list({
        fields: CAMPOS_PRODUTO,
        limit: 100,
        offset,
        region_id: regiao?.id,
      })
      kits.push(...products.filter(ehKitDeQuantidade))
      offset += products.length
      if (products.length < 100) break
    }

    return kits
  } catch (e) {
    aviso(e, "kits")
    return []
  }
}

/**
 * O degrau de quantidade de um produto: 1 frasco, 2 frascos, 3 frascos.
 *
 * Sai do catálogo, não de lista escrita à mão — os kits se anunciam pela
 * metadata e esta função só junta. Produto sem kit nenhum devolve um degrau
 * só, o dele mesmo, e a PDP mostra apenas o seletor de quantidade.
 *
 * A ECONOMIA é calculada contra o preço ATUAL do avulso (o que o cliente
 * pagaria comprando `n` separados hoje), nunca contra o preço cheio riscado.
 * Comparar com o riscado inflaria a vantagem — é a conta que o Procon autua.
 *
 * E ela pode dar ZERO, ou dar negativo e ser zerada pelo `Math.max`: kit que
 * custa o mesmo (ou mais) que os avulsos somados é erro de cadastro, e a
 * dobra não vai carimbar "economize R$ 0" em cima dele. Quem decide o que
 * fazer com degrau sem vantagem é a página, não esta função — aqui o número
 * é só honesto.
 */
export async function escadaDeQuantidade(handle: string): Promise<DegrauDeQuantidade[]> {
  "use cache"
  cacheTag(TAGS.produtos, TAGS.produto(handle))
  cacheLife("hours")

  const base = await buscarProdutoPorHandle(handle)
  const precoBase = base ? precosDe(base) : null
  const varianteBase = base?.variants?.[0]
  if (!base?.handle || !precoBase || !varianteBase) return []

  const primeiro: DegrauDeQuantidade = {
    handle: base.handle,
    varianteId: varianteBase.id,
    unidades: 1,
    preco: precoBase.atual,
    porUnidade: precoBase.atual,
    economia: 0,
    disponivel: temEstoque(varianteBase),
  }

  const degraus = (await kitsDoCatalogo()).flatMap<DegrauDeQuantidade>((p) => {
    const meta = p.metadata as MetaDeKit | null
    if (meta?.base !== handle) return []

    const unidades = Number(meta.unidades)
    const preco = precosDe(p)
    const variante = p.variants?.[0]
    if (!Number.isInteger(unidades) || unidades < 2 || !preco || !variante || !p.handle) return []

    return [
      {
        handle: p.handle,
        varianteId: variante.id,
        unidades,
        preco: preco.atual,
        // arredondar aqui, e não na hora de exibir: 149,90 / 2 dá
        // 74.95000000000002 em ponto flutuante, e dinheiro que sai desta
        // função redondo é dinheiro que ninguém precisa lembrar de arredondar
        // de novo três componentes adiante
        porUnidade: emCentavos(preco.atual / unidades),
        economia: Math.max(0, emCentavos(precoBase.atual * unidades - preco.atual)),
        disponivel: temEstoque(variante),
      },
    ]
  })

  /*
   * Dois kits com o mesmo número de frascos é erro de cadastro que acontece
   * (alguém duplica o de 2 pra testar e esquece publicado). Sem isto a dobra
   * mostraria dois botões idênticos com preços diferentes — some com o mais
   * caro, que é o que qualquer pessoa escolheria de qualquer jeito.
   */
  const porUnidades = new Map<number, DegrauDeQuantidade>()
  for (const degrau of [primeiro, ...degraus]) {
    const atual = porUnidades.get(degrau.unidades)
    if (!atual || degrau.preco < atual.preco) porUnidades.set(degrau.unidades, degrau)
  }

  return [...porUnidades.values()].sort((a, b) => a.unidades - b.unidades)
}

/**
 * Tem pra vender?
 *
 * Variação com `manage_inventory` desligado é sempre comprável — é assim que
 * o Medusa representa produto sem controle de estoque. Com ele ligado, vale
 * o número. O `?? true` do fim é deliberado: quando o campo não vem na
 * consulta, vender e falhar no carrinho é melhor que esconder um produto que
 * está disponível.
 */
export function temEstoque(variante: HttpTypes.StoreProductVariant): boolean {
  if (!variante.manage_inventory) return true
  if (variante.allow_backorder) return true
  const qtd = variante.inventory_quantity
  return typeof qtd === "number" ? qtd > 0 : true
}
