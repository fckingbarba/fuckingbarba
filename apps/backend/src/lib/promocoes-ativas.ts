import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import type { PromocaoCrua } from "./cupons"
import {
  ehPromocaoDoPainel,
  promocaoGuardada,
  promocoesNaLoja,
  type PromocaoAtiva,
  type PromocaoNaLoja,
  type ProdutoDaPromocao,
} from "./promocoes"

/**
 * AS PROMOÇÕES DO PAINEL, LIDAS DO MEDUSA — pro gancho do carrinho (que marca
 * as linhas a cada mudança), pro desconto por quantidade (que tira os
 * produtos em promoção das faixas que chegam no X) e pra rota da loja (`GET /store/promocoes`). A
 * regra, sem efeito nenhum, mora em `lib/promocoes.ts`.
 *
 * Guardadas por 30 segundos na memória do processo: o carrinho confere as
 * promoções a toda mudança, e cada conferência lendo o banco de novo é uma
 * ida a mais em cada clique na sacola. Quem cria, pausa ou liga uma promoção
 * pelo painel chama `esquecerPromocoes()` — a mudança vale na hora.
 */

const MEMORIA_MS = 30_000

export type PromocaoDoPainel = PromocaoAtiva & { id: string; codigo: string }

let lidas: { lista: PromocaoDoPainel[]; ate: number } | null = null
let naLoja: { lista: PromocaoNaLoja[]; ate: number } | null = null

/** Depois de criar, pausar ou ligar: a próxima leitura vai ao banco. */
export function esquecerPromocoes() {
  lidas = null
  naLoja = null
}

type Consulta = { graph: (a: object) => Promise<{ data: unknown[] }> }

/** As promoções do painel (ligadas ou não): o gancho e a rota decidem o que vale agora. */
export async function promocoesDoPainel(container: {
  resolve: (chave: string) => unknown
}): Promise<PromocaoDoPainel[]> {
  if (lidas && lidas.ate > Date.now()) return lidas.lista
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as Consulta
  const { data } = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "status", "is_automatic", "metadata"],
    filters: { is_automatic: true },
  })
  const lista = (data as PromocaoCrua[]).flatMap((p) => {
    if (!ehPromocaoDoPainel(p)) return []
    const guardada = promocaoGuardada(p)
    return guardada ? [{ id: p.id, codigo: String(p.code), status: p.status, guardada }] : []
  })
  lidas = { lista, ate: Date.now() + MEMORIA_MS }
  return lista
}

/**
 * Os produtos publicados, com as categorias e o preço promocional de agora
 * (o de UMA unidade abaixo do cheio: a lista de preço "sale" valendo). É o
 * que diz em quais produtos cada promoção vale.
 */
export async function produtosDasPromocoes(
  container: MedusaContainer | { resolve: (chave: string) => unknown }
): Promise<ProdutoDaPromocao[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as Consulta
  const pricing = container.resolve(Modules.PRICING) as {
    calculatePrices: (
      f: { id: string[] },
      c: { context: Record<string, unknown> }
    ) => Promise<{ id: string; calculated_amount?: unknown; original_amount?: unknown }[]>
  }
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "categories.id", "variants.price_set.id"],
    filters: { status: ProductStatus.PUBLISHED },
  })
  const produtos = data as {
    id: string
    categories?: ({ id?: string | null } | null)[] | null
    variants?: ({ price_set?: { id?: string | null } | null } | null)[] | null
  }[]
  const conjuntos = produtos.flatMap((p) =>
    (p.variants ?? []).flatMap((v) => (v?.price_set?.id ? [v.price_set.id] : []))
  )
  const precos = conjuntos.length
    ? await pricing.calculatePrices({ id: conjuntos }, { context: { currency_code: "brl" } })
    : []
  const promocional = new Set(
    precos.filter((c) => Number(c.calculated_amount) < Number(c.original_amount)).map((c) => c.id)
  )
  return produtos.map((p) => ({
    id: p.id,
    categorias: (p.categories ?? [])
      .map((c) => c?.id ?? "")
      .filter((id): id is string => Boolean(id)),
    precoPromocional: (p.variants ?? []).some(
      (v) => Boolean(v?.price_set?.id) && promocional.has(v!.price_set!.id!)
    ),
  }))
}

/**
 * O que a loja mostra (`GET /store/promocoes`): as que valem agora, com os
 * produtos. A lista guardada não serve promoção que já acabou, nem por um
 * segundo — o fim de cada uma vai junto (`ate`).
 */
export async function promocoesParaALoja(
  container: MedusaContainer | { resolve: (chave: string) => unknown },
  agora = Date.now()
): Promise<PromocaoNaLoja[]> {
  if (naLoja && naLoja.ate > agora)
    return naLoja.lista.filter((p) => p.ate === null || p.ate >= agora)
  const promocoes = await promocoesDoPainel(container)
  const lista = promocoes.some((p) => p.status === "active")
    ? promocoesNaLoja(promocoes, await produtosDasPromocoes(container), agora)
    : []
  naLoja = { lista, ate: agora + MEMORIA_MS }
  return lista
}
