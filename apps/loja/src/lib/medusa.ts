import "server-only"
import Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"
import type { SugestaoDaSacola } from "./carrinho-visivel"
import { PADRAO, type Configuracoes } from "./configuracoes"
import { emReais } from "./formato"
import type { ModeloDeRecomendacao } from "./recomendacao"

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
 * 4. Com backend configurado e sem resposta dele, a leitura LANÇA. Nunca
 *    devolve vazio, `null` ou o padrão no lugar da resposta que não veio.
 *
 * ┌─ POR QUE LANÇAR ───────────────────────────────────────────────────────┐
 * │ O que uma função `"use cache"` devolve fica guardado por horas ou      │
 * │ dias, e vai junto na página pré-renderizada, que é o que a Vercel      │
 * │ serve. Era assim que um restart do Medusa virava "esta categoria está  │
 * │ sem produto agora" até a revalidação seguinte, sem erro em lugar       │
 * │ nenhum: a lista vazia de quando ele não respondeu ficava guardada como │
 * │ se fosse o catálogo. O mesmo valia pra produto virar 404 e pra região  │
 * │ sumir (e, com ela, o carrinho).                                        │
 * │                                                                        │
 * │ Erro não entra em cache nenhum, nem no da função nem no da página:     │
 * │ • revalidação: a página que estava no ar continua sendo servida, e a   │
 * │   próxima visita tenta de novo;                                        │
 * │ • build: falha, e a versão anterior da loja segue no ar. Com o Railway │
 * │   de volta, é Redeploy na Vercel. Antes, o build passava e publicava a │
 * │   vitrine vazia;                                                       │
 * │ • quem abre uma página que não estava pronta (produto que ninguém      │
 * │   visitou desde o deploy, a categoria com `?ordem=`, o checkout) vê o  │
 * │   `app/error.tsx`, com "tentar de novo".                               │
 * │                                                                        │
 * │ Cair num padrão continua valendo, mas FORA do cache e só onde a tela   │
 * │ tem o que fazer sem o Medusa: o carrinho (`garantirCarrinho`) e o CEP  │
 * │ (`buscarCep`) fazem assim. Resposta vazia de verdade (categoria sem    │
 * │ produto, handle que não existe) continua sendo guardada: essa é o      │
 * │ catálogo.                                                              │
 * └────────────────────────────────────────────────────────────────────────┘
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
  /* O que o admin edita: política de frete e dados da empresa. Derrubada
     pelo próprio admin ao salvar, via POST /api/revalidar. */
  configuracoes: "configuracoes",
  /* O modelo do motor de recomendação. Ninguém derruba: vale uma hora, e a
     próxima leitura já traz o que os pedidos novos ensinaram. */
  recomendacoes: "recomendacoes",
} as const

/** Campos que a vitrine precisa; o resto fica no servidor. */
const CAMPOS_PRODUTO =
  // `created_at` entra por causa da ordenação "Novidades" da tela de
  // categoria: com `fields` explícito o Medusa devolve SÓ o que está aqui, e
  // sem esta palavra o ordenador comparava `undefined` com `undefined` e
  // devolvia a lista na mesma ordem, sem erro nenhum pra denunciar. O
  // `updated_at` caiu na mesma armadilha: é o `<lastmod>` do sitemap, que
  // saía sem data nenhuma.
  "id,title,handle,subtitle,description,thumbnail,weight,length,height,width,metadata,created_at,updated_at," +
  "*images,*categories,*variants,*variants.calculated_price," +
  "+variants.inventory_quantity,+variants.manage_inventory"

/* ── uma ida ao Medusa ────────────────────────────────────────────────────
 *
 * Tropeço acontece e dura segundos: o Railway trocando de versão num deploy,
 * uma conexão que caiu. Por isso cada pedido tem um prazo e uma segunda
 * chance antes de desistir, e desiste LANÇANDO (a regra 4, lá em cima).
 *
 * No build a paciência é maior: mais quatro tentativas, uns 40 segundos de
 * espera. O push sobe o Railway e a Vercel juntos, e um build que desiste
 * cedo demais pede um Redeploy à mão. Mais que isso não cabe: o Next dá 60
 * segundos por página (`staticPageGenerationTimeout`). Fora do build, uma
 * segunda tentativa só: do outro lado tem gente olhando pra tela.
 *
 * Só falha passageira ganha outra chance: sem resposta (rede, prazo
 * estourado) ou 5xx/429. Um 4xx é o Medusa dizendo não — chave publicável
 * errada, filtro inválido — e perguntar de novo dá a mesma resposta.
 */

const NO_BUILD = process.env.NEXT_PHASE === "phase-production-build"

/** A espera antes de cada nova tentativa. O tamanho da lista é o número delas. */
const ESPERAS_MS = NO_BUILD ? [2_000, 5_000, 10_000, 20_000] : [400]

/**
 * O prazo de cada pedido. Normal é menos de um segundo; o prazo existe pro
 * Medusa que aceita a conexão e não responde (banco sem conexão livre, por
 * exemplo): sem ele, a tela de quem abriu a página esperaria o infinito.
 */
const PRAZO_MS = 8_000

/** Rede, prazo estourado, 5xx ou 429: vale tentar de novo. Também serve pro carrinho. */
export function falhaPassageira(erro: unknown): boolean {
  const status = (erro as { status?: unknown } | null)?.status
  return typeof status !== "number" || status >= 500 || status === 429
}

function descrever(erro: unknown): string {
  if (!(erro instanceof Error)) return String(erro)
  if (erro.name === "TimeoutError") return `sem resposta em ${PRAZO_MS / 1000} s`
  const status = (erro as { status?: unknown }).status
  // O "fetch failed" do Node esconde o motivo (ECONNREFUSED, ENOTFOUND…) no `cause`.
  const codigo = (erro.cause as { code?: unknown } | undefined)?.code
  return [
    typeof status === "number" ? `HTTP ${status}` : "",
    erro.message,
    typeof codigo === "string" ? `(${codigo})` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

const esperar = (ms: number) => new Promise<void>((pronto) => setTimeout(pronto, ms))

/**
 * Um GET no Medusa, com prazo e nova chance. Se não der, lança um erro que
 * diz o quê e por quê — `[medusa] produtos: HTTP 502 Bad Gateway` — pro log
 * da Vercel: é a linha que se procura quando a loja mostrar "tentar de novo".
 *
 * TODA TENTATIVA SAI PRA REDE DE VERDADE. Visto no build: o Medusa voltou
 * no meio e as tentativas seguintes continuaram falhando até desistir. Duas
 * memórias do Next, feitas pra poupar ida ao servidor, são desligadas aqui:
 *   • a dos GET iguais dentro de uma renderização — o `signal` desliga
 *     (regra do `dedupe-fetch` do Next), e de quebra dá o prazo;
 *   • o cache de `fetch` do build, que guarda cada resposta por 15 minutos
 *     em `.next/cache`, sem tag — `cache: "no-store"` desliga. Com uma
 *     cópia vencida lá, a nova tentativa repetia a falha. E com uma cópia
 *     em dia era pior: um deploy menos de 15 minutos depois do outro montava
 *     a loja com as respostas do build anterior sem perguntar ao Medusa, e
 *     tag derrubada pelo admin não alcança essa cópia. Quem guarda a leitura
 *     é o `"use cache"` de cada função, com a tag certa.
 *
 * É por isso também que as leituras daqui usam `sdk.client.fetch` com o
 * caminho, e não `sdk.store.product.list` e companhia: os atalhos do SDK
 * fazem a mesma chamada, mas não deixam passar `signal` nem `cache`.
 */
async function lerDoMedusa<T>(
  contexto: string,
  caminho: string,
  query?: Record<string, unknown>,
  cabecalhos?: Record<string, string>
): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await sdk!.client.fetch<T>(caminho, {
        query,
        headers: cabecalhos,
        signal: AbortSignal.timeout(PRAZO_MS),
        cache: "no-store",
      })
    } catch (e) {
      const espera = ESPERAS_MS[tentativa]
      if (espera === undefined || !falhaPassageira(e)) {
        throw new Error(`[medusa] ${contexto}: ${descrever(e)}`, { cause: e })
      }
      console.warn(`[medusa] ${contexto}: ${descrever(e)} — de novo em ${espera} ms`)
      await esperar(espera)
    }
  }
}

/**
 * OS KITS DE QUANTIDADE, APOSENTADOS
 *
 * "2 frascos" e "3 frascos" eram produtos à parte no Medusa, com SKU e
 * estoque próprios. Deram lugar ao desconto por quantidade no MESMO produto
 * (`escadaDeQuantidade`, abaixo, e `backend/src/lib/precos-por-quantidade.ts`),
 * e o script `backend:quantidade` passa os kits pra rascunho.
 *
 * O filtro continua porque rascunho é passo manual: até alguém rodar o
 * script, um kit publicado apareceria na grade como produto — "Fator",
 * "Fator 2x" e "Fator 3x" lado a lado.
 */
const TIPO_KIT = "kit-quantidade"

export function ehKitDeQuantidade(produto: HttpTypes.StoreProduct): boolean {
  return (produto.metadata as { tipo?: unknown } | null)?.tipo === TIPO_KIT
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
    const { products } = await lerDoMedusa<HttpTypes.StoreProductListResponse>(
      "produtos",
      "/store/products",
      { ...params, limit: tamanho, offset }
    )
    coletados.push(...semKits(products))
    offset += products.length
    if (coletados.length >= limite || products.length < tamanho) break
  }

  return coletados.slice(0, limite)
}

export async function regiaoBrasil(): Promise<HttpTypes.StoreRegion | null> {
  "use cache"
  cacheTag(TAGS.regioes)
  cacheLife("days")
  if (!sdk) return null
  const { regions } = await lerDoMedusa<HttpTypes.StoreRegionListResponse>(
    "regiões",
    "/store/regions",
    { limit: 10 }
  )
  return regions.find((r) => r.currency_code === "brl") ?? regions[0] ?? null
}

/**
 * AS CONFIGURAÇÕES DA LOJA — o que o admin edita e a vitrine anuncia.
 *
 * Fica aqui, e não em `lib/configuracoes.ts`, porque `lib/configuracoes.ts`
 * é importado por componentes de CLIENTE (a gaveta da sacola, a barra da
 * PDP) — e este arquivo tem `import "server-only"` no topo.
 *
 * Cache de DIAS, e não de minutos: isto só muda quando alguém mexe no admin,
 * e o admin avisa a loja na hora (`POST /api/revalidar`). Cache curto por
 * desconfiança não corrige nada — só faz o dado ficar errado por menos tempo.
 *
 * ERRO LANÇA, e a página no ar fica com o valor que o Medusa confirmou por
 * último. Já foi "erro devolve o PADRÃO" (sem promoção de frete, sem dados
 * da empresa), pra nunca anunciar uma oferta sem confirmar (CDC art. 30).
 * Só que o padrão ficava guardado por DIAS: um tropeço tirava do ar a
 * promoção de frete e, do rodapé, o CNPJ e o contato, que a lei do comércio
 * eletrônico manda mostrar (Decreto 7.962/2013). E o valor de antes não é
 * palpite: quem muda a política é o admin, e salvar derruba esta tag na hora
 * — com o Medusa de pé, porque foi nele que salvou.
 */
export async function configuracoes(): Promise<Configuracoes> {
  "use cache"
  cacheTag(TAGS.configuracoes)
  cacheLife("days")
  if (!sdk) return PADRAO
  const { configuracoes: c } = await lerDoMedusa<{ configuracoes: Configuracoes }>(
    "configurações",
    "/store/configuracoes"
  )
  // `home` chegou depois: um Medusa de antes dele responde sem o campo, e a
  // loja segue com a foto em vez de quebrar a home.
  return c ? { ...c, home: c.home ?? PADRAO.home } : PADRAO
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
  const { promocao } = await lerDoMedusa<{ promocao: Promocao | null }>(
    "promoção",
    "/store/promocao"
  )
  return promocao ?? null
}

export async function listarCategorias(): Promise<HttpTypes.StoreProductCategory[]> {
  "use cache"
  cacheTag(TAGS.categorias)
  cacheLife("hours")
  if (!sdk) return []
  const { product_categories } = await lerDoMedusa<HttpTypes.StoreProductCategoryListResponse>(
    "categorias",
    "/store/product-categories",
    { fields: "id,name,handle,description,rank", limit: 50 }
  )
  return product_categories
}

export async function buscarCategoria(
  handle: string
): Promise<HttpTypes.StoreProductCategory | null> {
  "use cache"
  cacheTag(TAGS.categorias, TAGS.categoria(handle))
  cacheLife("hours")
  if (!sdk) return null
  const { product_categories } = await lerDoMedusa<HttpTypes.StoreProductCategoryListResponse>(
    `categoria ${handle}`,
    "/store/product-categories",
    { handle, fields: "id,name,handle,description", limit: 1 }
  )
  return product_categories[0] ?? null
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
  const regiao = await regiaoBrasil()
  return paginarSemKits(
    {
      fields: CAMPOS_PRODUTO,
      region_id: regiao?.id,
      ...(opcoes.categoriaId ? { category_id: [opcoes.categoriaId] } : {}),
    },
    opcoes.limite ?? 48
  )
}

/**
 * O produto, ou `null` se o handle não existe — e SÓ nesse caso. O `null`
 * vira 404 na PDP (`dobra.tsx`) e fica guardado por horas; foi assim que um
 * Medusa fora do ar transformava produto de verdade em "não encontrado".
 */
export async function buscarProdutoPorHandle(
  handle: string
): Promise<HttpTypes.StoreProduct | null> {
  "use cache"
  cacheTag(TAGS.produtos, TAGS.produto(handle))
  cacheLife("hours")
  if (!sdk) return null
  const regiao = await regiaoBrasil()
  const { products } = await lerDoMedusa<HttpTypes.StoreProductListResponse>(
    `produto ${handle}`,
    "/store/products",
    { handle, fields: CAMPOS_PRODUTO, limit: 1, region_id: regiao?.id }
  )
  return products[0] ?? null
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
  /** o produto — o mesmo em todos os degraus */
  handle: string
  /** a variação — a mesma em todos: "2 unidades" é quantidade 2 dela */
  varianteId: string
  unidades: number
  /** preço total deste degrau, em reais */
  preco: number
  /** preço por unidade nesta quantidade, pra deixar a comparação na cara */
  porUnidade: number
  /** quanto se economiza contra comprar `unidades` avulsos. 0 no primeiro degrau */
  economia: number
  disponivel: boolean
  /**
   * A linha de apoio do cartão. Só o de uma unidade pode ter uma escrita à
   * mão (a `notaDoAvulso` do admin, aplicada na `Dobra`); os outros caem na
   * economia calculada, que é sempre verdade.
   */
  nota: string | null
}

/**
 * O PREÇO DE UMA UNIDADE levando 1, 2 e 3 — `{ 1: 79.9, 2: 76.45, 3: 74.3 }`.
 *
 * Vem do backend (`/store/precos-por-quantidade`), que pergunta pro Medusa
 * com a quantidade no contexto: é a MESMA conta que o carrinho faz quando a
 * pessoa adiciona ou muda a quantidade na sacola. "3" vale pra 3 ou mais.
 *
 * `null` quando não deu pra perguntar — quem chama decide o que fazer, e o
 * que ela faz é não anunciar desconto nenhum (ver `escadaDeQuantidade`).
 */
async function precosPorQuantidade(varianteId: string): Promise<Record<number, number> | null> {
  if (!sdk) return null
  try {
    const { precos } = await lerDoMedusa<{ precos: Record<string, Record<string, number>> }>(
      "preços por quantidade",
      "/store/precos-por-quantidade",
      { variante: varianteId }
    )
    const daVariante = precos?.[varianteId] ?? {}
    return Object.fromEntries(
      Object.entries(daVariante).map(([quantidade, unitario]) => [
        Number(quantidade),
        Number(unitario),
      ])
    )
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e)
    return null
  }
}

/** As opções que a PDP mostra. Daqui pra cima, vale o preço do 3. */
const UNIDADES = [1, 2, 3] as const

/**
 * A ESCADA DE QUANTIDADE: 1, 2 e 3 unidades do MESMO produto, com o preço
 * que o carrinho vai cobrar por cada uma.
 *
 * Não é mais kit: "2 unidades" é quantidade 2 da mesma variação, e o
 * desconto é o Medusa que dá, pela quantidade da linha (a lista "Desconto
 * por quantidade", que o backend mantém). Esta função só pergunta quanto sai
 * e monta os degraus.
 *
 * A ECONOMIA é calculada contra o preço ATUAL da unidade (o que o cliente
 * pagaria comprando `n` separados hoje), nunca contra o preço cheio riscado.
 * Comparar com o riscado inflaria a vantagem — é a conta que o Procon autua.
 *
 * SEM RESPOSTA DO BACKEND, UM DEGRAU SÓ — o preço de uma unidade, que vem
 * do próprio produto. E guardado por MINUTOS, não horas: é o que acontece
 * num deploy em que a loja sobe antes do backend, e a página tem que se
 * corrigir sozinha em vez de ficar sem os degraus até a próxima mudança de
 * catálogo. O prazo curto precisa estar AQUI: com `cacheLife` explícito, a
 * função de fora manda no prazo de tudo o que ela guarda.
 */
export async function escadaDeQuantidade(handle: string): Promise<DegrauDeQuantidade[]> {
  "use cache"
  cacheTag(TAGS.produtos, TAGS.produto(handle))

  const base = await buscarProdutoPorHandle(handle)
  const precoBase = base ? precosDe(base) : null
  const variante = base?.variants?.[0]
  if (!base?.handle || !precoBase || !variante) {
    cacheLife("hours")
    return []
  }

  const porQuantidade = await precosPorQuantidade(variante.id)
  if (porQuantidade) cacheLife("hours")
  else cacheLife("minutes")

  const avulso = porQuantidade?.[1] ?? precoBase.atual
  return UNIDADES.flatMap<DegrauDeQuantidade>((unidades) => {
    const unitario = unidades === 1 ? avulso : porQuantidade?.[unidades]
    // Faixa que não sai mais barata que as unidades avulsas não vira degrau:
    // um cartão de "2 unidades" sem vantagem nenhuma é só ruído.
    if (!unitario || (unidades > 1 && unitario >= avulso)) return []
    // arredondar aqui, e não na hora de exibir: 76,45 x 2 dá
    // 152.89999999999998 em ponto flutuante, e dinheiro que sai desta função
    // redondo é dinheiro que ninguém precisa lembrar de arredondar de novo
    // três componentes adiante
    const preco = emCentavos(unitario * unidades)
    return [
      {
        handle: base.handle!,
        varianteId: variante.id,
        unidades,
        preco,
        porUnidade: unitario,
        economia: Math.max(0, emCentavos(avulso * unidades - preco)),
        disponivel: temEstoque(variante, unidades),
        nota: null,
      },
    ]
  })
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
export function temEstoque(variante: HttpTypes.StoreProductVariant, unidades = 1): boolean {
  if (!variante.manage_inventory) return true
  if (variante.allow_backorder) return true
  const qtd = variante.inventory_quantity
  return typeof qtd === "number" ? qtd >= unidades : true
}

/**
 * OS PRODUTOS DO "LEVA JUNTO" DA SACOLA, prontos pra gaveta escolher
 * (`escolherLevaJunto`, em `lib/recomendacao.ts`): os mesmos da
 * vitrine, só os que vão pra sacola num clique (`varianteDoCard`, logo
 * abaixo) — sem estoque ou com variação pra escolher, ficam de fora.
 *
 * Mora no layout raiz, porque a gaveta também mora: cacheado como a
 * vitrine, e derrubado junto com ela quando o admin mexe num produto.
 */
export async function vitrineDaSacola(): Promise<SugestaoDaSacola[]> {
  "use cache"
  cacheTag(TAGS.produtos)
  cacheLife("hours")
  const produtos = await listarProdutos()
  return produtos.flatMap((p) => {
    const varianteId = varianteDoCard(p)
    const preco = precosDe(p)?.atual
    if (!varianteId || !preco || !p.handle) return []
    return [
      { varianteId, handle: p.handle, nome: p.title ?? "", imagem: p.thumbnail ?? null, preco },
    ]
  })
}

/**
 * O MODELO DO MOTOR DE RECOMENDAÇÃO (`lib/recomendacao.ts`), ou `null`.
 *
 * Vem do Medusa, assinado com o `REVALIDAR_SEGREDO` — a rota só responde à
 * loja, porque montar o modelo lê um ano de pedidos. Vale uma hora.
 *
 * FALHA NÃO FICA GUARDADA POR UMA HORA. Medusa fora do ar é coisa de
 * segundos, e guardar o `null` por uma hora deixaria a gaveta na regra
 * antiga e o checkout sem oferta até a próxima leitura. Por isso o `null`
 * de erro vale minutos (`cacheLife` diferente em cada caminho — o Next
 * deixa, contanto que só um rode). Sem o segredo, o `null` vale a hora: não
 * é tropeço, é configuração.
 */
export async function modeloDeRecomendacao(): Promise<ModeloDeRecomendacao | null> {
  "use cache"
  cacheTag(TAGS.recomendacoes)
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!sdk || !segredo) {
    cacheLife("hours")
    return null
  }
  try {
    const { modelo } = await lerDoMedusa<{ modelo: ModeloDeRecomendacao }>(
      "recomendações",
      "/store/recomendacoes",
      undefined,
      { "x-loja-segredo": segredo }
    )
    cacheLife("hours")
    return modelo
  } catch (e) {
    console.warn(e instanceof Error ? e.message : String(e))
    cacheLife("minutes")
    return null
  }
}

/**
 * A variação que o "Comprar" da vitrine põe direto na sacola — ou `null`, e
 * aí o botão continua levando pra página do produto.
 *
 * Só com UMA variação, com preço e com estoque. Produto com tamanho ou cheiro
 * pra escolher precisa da escolha antes da sacola; e um "Comprar" que
 * responde "acabou" depois do clique é pior do que a página que diz isso
 * antes dele.
 */
export function varianteDoCard(produto: HttpTypes.StoreProduct): string | null {
  const variantes = produto.variants ?? []
  if (variantes.length !== 1) return null
  const [variante] = variantes
  if (typeof variante.calculated_price?.calculated_amount !== "number") return null
  return temEstoque(variante) ? variante.id : null
}
