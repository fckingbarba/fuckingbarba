import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PriceListStatus,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  batchPriceListPricesWorkflow,
  createPriceListsWorkflow,
  updatePriceListsWorkflow,
} from "@medusajs/medusa/core-flows"
import { OFERTAS } from "../../modules/ofertas"
import type OfertasService from "../../modules/ofertas/service"
import { TITULO_DA_LISTA } from "../precos-por-quantidade"
import {
  chaveDoPreco,
  MARCA_DA_OFERTA,
  PREFIXO_DA_LISTA,
  precosDaLista,
  type PrecoDaLista,
  type ProdutoDaLoja,
  type ProdutoDaOferta,
} from "./regras"

/**
 * AS OFERTAS NO MEDUSA — a lista de preço de cada oferta e os preços dela
 * (a regra está em `regras.ts`).
 *
 * A LISTA: "sale", com a regra `fb_oferta` = o id da oferta, o começo e o
 * fim da oferta (`starts_at`/`ends_at`) e, pausada, em rascunho. O título
 * começa com `PREFIXO_DA_LISTA`: o promocional do painel e a importação do
 * Bling tiram o preço de um produto de TODAS as outras listas, menos destas
 * (e da do desconto por quantidade), e o contador da home não conta prazo
 * de oferta oculta.
 *
 * OS PREÇOS: os de `precosDaLista` pra cada variação dos produtos da oferta,
 * refeitos na criação, ao ligar de novo e a cada minuto (o job
 * `precos-por-quantidade`, logo depois das faixas) — o promocional da
 * vitrine pode cair abaixo do "por" a qualquer hora. Rodada sem mudança só
 * lê.
 */

const MOEDA = "brl"

export type OfertaGuardada = {
  id: string
  slug: string
  nome: string
  titulo: string
  chamada: string | null
  comeca_em: Date | string
  termina_em: Date | string
  pausada: boolean
  produtos: ProdutoDaOferta[]
  lista_id: string | null
  criada_por?: string | null
  created_at?: Date | string
}

export const servicoDasOfertas = (container: MedusaContainer) =>
  container.resolve<OfertasService>(OFERTAS)

/** Os produtos guardados na oferta, lidos com cuidado (é JSON do banco). */
export function produtosGuardados(v: unknown): ProdutoDaOferta[] {
  return (Array.isArray(v) ? v : []).flatMap((p) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>
    const por = Number(o.por)
    return typeof o.produto === "string" && Number.isFinite(por) && por > 0
      ? [{ produto: o.produto, por }]
      : []
  })
}

export type ProdutoComPreco = ProdutoDaLoja & {
  handle: string | null
  imagem: string | null
  publicado: boolean
  /** O preço cheio (o da variação, sem promoção), ou `null`. */
  cheio: number | null
  /** Cada variação e o conjunto de preços dela. */
  variantes: { id: string; conjunto: string }[]
}

/**
 * Os produtos da loja com o preço de HOJE de uma unidade (com o promocional,
 * como a vitrine mostra) e o cheio. Sem `ids`, todos os publicados — o
 * formulário do painel; com `ids`, esses (os de uma oferta), publicados ou
 * não.
 */
export async function produtosComPreco(
  container: MedusaContainer,
  ids?: string[]
): Promise<Map<string, ProdutoComPreco>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  if (ids && !ids.length) return new Map()
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "thumbnail",
      "status",
      "variants.id",
      "variants.price_set.id",
    ],
    filters: ids ? { id: ids } : { status: ProductStatus.PUBLISHED },
  })
  const produtos = data as {
    id: string
    title?: string | null
    handle?: string | null
    thumbnail?: string | null
    status?: string | null
    variants?: ({ id: string; price_set?: { id?: string | null } | null } | null)[] | null
  }[]
  const conjuntos = produtos.flatMap((p) =>
    (p.variants ?? []).flatMap((v) => (v?.price_set?.id ? [v.price_set.id] : []))
  )
  const calculados = conjuntos.length
    ? await container
        .resolve(Modules.PRICING)
        .calculatePrices({ id: conjuntos }, { context: { currency_code: MOEDA } })
    : []
  const numero = (v: unknown) => {
    const n = Number(v)
    return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : null
  }
  const porConjunto = new Map(
    calculados.map((c) => [
      c.id,
      { hoje: numero(c.calculated_amount), cheio: numero(c.original_amount) },
    ])
  )
  return new Map(
    produtos.map((p) => {
      const variantes = (p.variants ?? []).flatMap((v) =>
        v?.id && v.price_set?.id ? [{ id: v.id, conjunto: v.price_set.id }] : []
      )
      // O card da loja mostra a variação mais barata: o "hoje" do produto é o menor.
      const precos = variantes.map((v) => porConjunto.get(v.conjunto)).filter(Boolean)
      const hoje = precos.map((x) => x!.hoje).filter((x): x is number => x !== null)
      const cheio = precos.map((x) => x!.cheio).filter((x): x is number => x !== null)
      return [
        p.id,
        {
          nome: p.title ?? p.id,
          handle: p.handle ?? null,
          imagem: p.thumbnail ?? null,
          publicado: p.status === ProductStatus.PUBLISHED,
          preco: hoje.length ? Math.min(...hoje) : null,
          cheio: cheio.length ? Math.min(...cheio) : null,
          variantes,
        },
      ] as const
    })
  )
}

const statusDa = (o: Pick<OfertaGuardada, "pausada">) =>
  o.pausada ? PriceListStatus.DRAFT : PriceListStatus.ACTIVE

/**
 * Cria a lista da oferta (sem preços: `acertarPrecosDasOfertas` põe) ou
 * acerta a de uma que já tem: o status (pausada = rascunho) e as datas.
 * Devolve o id da lista.
 */
export async function gravarListaDaOferta(
  container: MedusaContainer,
  oferta: OfertaGuardada
): Promise<string> {
  const datas = {
    starts_at: new Date(oferta.comeca_em).toISOString(),
    ends_at: new Date(oferta.termina_em).toISOString(),
  }
  if (oferta.lista_id) {
    await updatePriceListsWorkflow(container).run({
      input: { price_lists_data: [{ id: oferta.lista_id, status: statusDa(oferta), ...datas }] },
    })
    return oferta.lista_id
  }
  const { result } = await createPriceListsWorkflow(container).run({
    input: {
      price_lists_data: [
        {
          title: `${PREFIXO_DA_LISTA}${oferta.slug}`,
          description:
            "Gerada pelo painel (Cupons e descontos → Ofertas ocultas): o preço de quem abre " +
            "o link da oferta. Não edite à mão — o backend refaz a cada minuto.",
          // Sem `type`: o padrão do Medusa é "sale" — fica o MENOR preço.
          status: statusDa(oferta),
          ...datas,
          rules: { [MARCA_DA_OFERTA]: [oferta.id] },
          prices: [],
        },
      ],
    },
  })
  const id = result[0]!.id
  await servicoDasOfertas(container).updateOfertas({ id: oferta.id, lista_id: id })
  return id
}

/**
 * As ofertas que ainda podem vender (ou vão): não apagadas e com o fim há
 * menos de uma hora — a que acabou fica uns minutos na conta, pro preço de
 * quem estava no checkout na virada não mudar no meio (a lista já para de
 * valer sozinha no fim).
 */
export async function ofertasAbertas(container: MedusaContainer): Promise<OfertaGuardada[]> {
  const desde = new Date(Date.now() - 60 * 60_000)
  const lidas = await servicoDasOfertas(container).listOfertas(
    { termina_em: { $gt: desde } },
    { take: 200 }
  )
  return (lidas as unknown as OfertaGuardada[]).map((o) => ({
    ...o,
    produtos: produtosGuardados(o.produtos),
  }))
}

/**
 * OS PREÇOS DAS LISTAS DAS OFERTAS, refeitos (ver o quadro de `regras.ts`):
 * pra cada variação dos produtos de cada oferta aberta, o menor entre o
 * "por" e o preço de hoje, e as faixas de quantidade abaixo dele. Só escreve
 * o que mudou. `so`: só estas ofertas (a recém-criada); sem, todas as
 * abertas — a rodada do minuto.
 */
export async function acertarPrecosDasOfertas(
  container: MedusaContainer,
  so?: OfertaGuardada[]
): Promise<{ escritos: number }> {
  const ofertas = (so ?? (await ofertasAbertas(container))).filter((o) => o.lista_id)
  if (!ofertas.length) return { escritos: 0 }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pricing = container.resolve(Modules.PRICING)

  const ids = [...new Set(ofertas.flatMap((o) => o.produtos.map((p) => p.produto)))]
  const produtos = await produtosComPreco(container, ids)
  const conjuntos = [...produtos.values()].flatMap((p) => p.variantes.map((v) => v.conjunto))

  // O preço de hoje de cada variação, e as faixas dela.
  const hoje = new Map<string, number | null>()
  if (conjuntos.length) {
    const calculados = await pricing.calculatePrices(
      { id: conjuntos },
      { context: { currency_code: MOEDA } }
    )
    for (const c of calculados) {
      const n = Number(c.calculated_amount)
      hoje.set(c.id, Number.isFinite(n) && n > 0 ? n : null)
    }
  }
  const faixas = new Map<string, PrecoDaLista[]>()
  const daQuantidade = (await pricing.listPriceLists({ q: TITULO_DA_LISTA })).find(
    (l) => l.title === TITULO_DA_LISTA
  )
  if (daQuantidade && conjuntos.length) {
    const precos = await pricing.listPrices(
      { price_list_id: [daQuantidade.id], price_set_id: conjuntos },
      { select: ["price_set_id", "amount", "min_quantity", "max_quantity"], take: 5000 }
    )
    for (const p of precos) {
      const lista = faixas.get(p.price_set_id!) ?? []
      lista.push({
        min: p.min_quantity == null ? null : Number(p.min_quantity),
        max: p.max_quantity == null ? null : Number(p.max_quantity),
        valor: Number(p.amount),
      })
      faixas.set(p.price_set_id!, lista)
    }
  }

  let escritos = 0
  for (const oferta of ofertas) {
    const desejados = new Map<
      string,
      { variant_id: string; amount: number; min_quantity?: number; max_quantity?: number }
    >()
    for (const item of oferta.produtos) {
      for (const v of produtos.get(item.produto)?.variantes ?? []) {
        for (const p of precosDaLista(
          item.por,
          hoje.get(v.conjunto) ?? null,
          faixas.get(v.conjunto) ?? []
        )) {
          desejados.set(chaveDoPreco(v.conjunto, p), {
            variant_id: v.id,
            amount: p.valor,
            ...(p.min !== null ? { min_quantity: p.min } : {}),
            ...(p.max !== null ? { max_quantity: p.max } : {}),
          })
        }
      }
    }

    const existentes = await pricing.listPrices(
      { price_list_id: [oferta.lista_id!] },
      { select: ["id", "price_set_id", "amount", "min_quantity", "max_quantity"], take: 5000 }
    )
    const create: (typeof desejados extends Map<string, infer V> ? V : never)[] = []
    const update: { id: string; variant_id: string; amount: number; currency_code: string }[] = []
    const remover: string[] = []
    const vistos = new Set<string>()
    for (const e of existentes) {
      const chave = chaveDoPreco(e.price_set_id!, {
        min: e.min_quantity == null ? null : Number(e.min_quantity),
        max: e.max_quantity == null ? null : Number(e.max_quantity),
      })
      const quero = desejados.get(chave)
      if (!quero || vistos.has(chave)) {
        remover.push(e.id)
        continue
      }
      vistos.add(chave)
      if (Math.round(Number(e.amount) * 100) !== Math.round(quero.amount * 100))
        update.push({
          id: e.id,
          variant_id: quero.variant_id,
          amount: quero.amount,
          currency_code: MOEDA,
        })
    }
    for (const [chave, quero] of desejados) if (!vistos.has(chave)) create.push(quero)
    if (!create.length && !update.length && !remover.length) continue
    await batchPriceListPricesWorkflow(container).run({
      input: {
        data: {
          id: oferta.lista_id!,
          create: create.map((p) => ({ ...p, currency_code: MOEDA })),
          update,
          delete: remover,
        },
      },
    })
    escritos += create.length + update.length + remover.length
    logger.info(
      `[ofertas] ${oferta.slug}: ${create.length} preço(s) novo(s), ${update.length} mudado(s), ` +
        `${remover.length} fora`
    )
  }
  return { escritos }
}
