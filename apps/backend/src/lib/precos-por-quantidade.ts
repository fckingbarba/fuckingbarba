import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PriceListStatus,
  ProductStatus,
} from "@medusajs/framework/utils"
import { batchPriceListPricesWorkflow, createPriceListsWorkflow } from "@medusajs/medusa/core-flows"
import { avisarALoja } from "./revalidar"

/**
 * DESCONTO POR QUANTIDADE — levar 2 ou 3 unidades do MESMO produto sai mais
 * barato por unidade, e quem cobra isso é o Medusa, não a tela.
 *
 * ┌─ COMO ─────────────────────────────────────────────────────────────────┐
 * │ Uma lista de preço própria, "Desconto por quantidade", com o preço     │
 * │ POR UNIDADE de cada variação em duas faixas: 2 unidades (só 2) e 3 ou  │
 * │ mais. O Medusa escolhe a faixa pela quantidade da linha do carrinho —  │
 * │ ao adicionar, ao mudar a quantidade na sacola, no checkout — e entre   │
 * │ as listas que valem fica sempre com o MENOR preço. Pra 1 unidade nada  │
 * │ muda: as faixas começam em 2.                                          │
 * │                                                                        │
 * │ O preço da faixa sai do preço ATUAL da unidade (o da promoção, se      │
 * │ houver). Mudou o preço no admin, o job `precos-por-quantidade` refaz   │
 * │ a lista em até 1 minuto e avisa a loja.                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE DE MINUTO EM MINUTO ──────────────────────────────────────────┐
 * │ Promoção que acaba (pela data de fim ou desligada no admin) não avisa  │
 * │ ninguém: o Medusa não emite evento de lista de preço, e a data passa   │
 * │ sozinha. Enquanto o job não rodava, as faixas continuavam calculadas   │
 * │ sobre o preço da promoção: com o óleo voltando a R$ 79,90, 2 unidades  │
 * │ saíam por R$ 104,90 em vez de R$ 152,90 (achado em 24/09) — até 15     │
 * │ minutos de venda abaixo do preço a cada promoção encerrada. E a loja   │
 * │ seguia mostrando o preço velho, porque nada a avisava.                 │
 * │                                                                        │
 * │ Agora a rodada é de minuto em minuto, e cada uma compara a FOTO dos    │
 * │ preços (o de uma unidade, com e sem promoção, e as listas de preço com │
 * │ as datas) com a da rodada anterior: mudou, a loja é avisada na hora    │
 * │ (`produtos` e `promocao`, a das ofertas relâmpago da home). Sem nada   │
 * │ mudando, a rodada só lê.                                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SUBSTITUI OS KITS DE QUANTIDADE (o antigo `scripts/kits-de-quantidade.ts`), que eram
 * produtos separados — "Kit 2 frascos" — com preço fixo e ESTOQUE PRÓPRIO:
 * três estoques pro mesmo frasco. Aqui é um SKU e um estoque; "2 unidades" é
 * quantidade 2. Pedido antigo de kit continua de pé: o script
 * `precos-por-quantidade` só passa os kits pra rascunho.
 */

/**
 * AS FAIXAS. Trocar aqui e fazer deploy: o job recalcula tudo.
 *
 * `ate: null` é "daqui pra cima": 3, 4, 10 unidades pagam o preço da faixa
 * de 3. Um desconto que ACABASSE em 3 faria a quarta unidade encarecer a
 * compra inteira.
 *
 * O MESMO NÚMERO ESTÁ NO MEDUSA FALSO do CI (`apps/loja/ferramentas/
 * medusa-falso.mjs`), que imita esta conta pro build da loja ter o que
 * mostrar. Mudou aqui, muda lá.
 */
export const FAIXAS = [
  { unidades: 2, ate: 2, desconto: 4 },
  { unidades: 3, ate: null, desconto: 6 },
] as const

export const TITULO_DA_LISTA = "Desconto por quantidade"
const MOEDA = "brl"
const KIT_DE_QUANTIDADE = "kit-quantidade"

/**
 * O TOTAL da faixa, em CENTAVOS: `unidades` x preço, menos o desconto,
 * arredondado PRA BAIXO até o ",90" mais próximo que dê pra cobrar.
 *
 * ┌─ POR QUE "QUE DÊ PRA COBRAR" ──────────────────────────────────────────┐
 * │ O Medusa cobra preço POR UNIDADE, em centavos inteiros. R$ 152,90 por  │
 * │ 2 dá R$ 76,45 cada — sempre fecha, porque todo total terminado em ,90  │
 * │ é par. Por 3 não: R$ 224,90 / 3 = R$ 74,9666… e o carrinho cobraria    │
 * │ R$ 224,91 ou R$ 224,88. Só fecham os totais cuja parte em reais é      │
 * │ múltipla de 3 (R$ 222,90 = 3 x R$ 74,30). Então a conta desce de real  │
 * │ em real — no máximo dois — até achar um que feche. A diferença fica    │
 * │ sempre com o cliente: nunca um centavo acima do desconto anunciado.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * `null` quando a faixa não sai mais barata que as unidades avulsas (produto
 * de centavos, em que o arredondamento come o desconto): aí ela não existe,
 * e a página não anuncia vantagem nenhuma.
 */
export function totalDaFaixa(
  precoUnitario: number,
  unidades: number,
  desconto: number
): number | null {
  const cheio = Math.round(precoUnitario * 100) * unidades
  const comDesconto = Math.floor((cheio * (100 - desconto)) / 100)
  let reais = Math.floor((comDesconto - 90) / 100)
  while (reais >= 0 && (reais * 100 + 90) % unidades !== 0) reais--
  if (reais < 0) return null
  const total = reais * 100 + 90
  return total < cheio ? total : null
}

/** O preço POR UNIDADE da faixa, em reais — o número que vai pro Medusa. */
export function unitarioDaFaixa(
  precoUnitario: number,
  unidades: number,
  desconto: number
): number | null {
  const total = totalDaFaixa(precoUnitario, unidades, desconto)
  return total === null ? null : total / unidades / 100
}

/** BigNumber do Medusa, número ou texto → número. */
function emNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

type PrecoDesejado = {
  variant_id: string
  amount: number
  min_quantity: number
  max_quantity: number | null
}

const chave = (conjunto: string, min: number | null, max: number | null) =>
  `${conjunto}|${min ?? ""}|${max ?? ""}`

/**
 * A foto da rodada anterior, na memória do processo. Depois de reiniciar, a
 * primeira rodada só tira a foto — o deploy já derrubou o cache da loja.
 */
let fotoAnterior: string | null = null

/** As etiquetas que um preço novo derruba na loja. */
const ETIQUETAS_DE_PRECO = ["produtos", "promocao"]

/**
 * O que a loja mostra de preço, num texto só: o de uma unidade (com e sem
 * promoção) de cada variação, e as listas de preço com situação e datas — a
 * data de fim é o relógio das ofertas relâmpago da home. A lista das faixas
 * fica de fora: quem escreve nela é esta rodada.
 */
function fotoDosPrecos(
  atuais: { id: string; calculated_amount?: unknown; original_amount?: unknown }[],
  listas: {
    id: string
    title?: string | null
    status?: string | null
    starts_at?: unknown
    ends_at?: unknown
  }[]
): string {
  const precos = atuais.map(
    (a) => `${a.id}:${emNumero(a.calculated_amount)}:${emNumero(a.original_amount)}`
  )
  const datas = listas
    .filter((l) => l.title !== TITULO_DA_LISTA)
    .map((l) => `${l.id}:${l.status}:${String(l.starts_at ?? "")}:${String(l.ends_at ?? "")}`)
  return [...precos.sort(), "|", ...datas.sort()].join(",")
}

/**
 * Refaz a lista "Desconto por quantidade" a partir dos preços atuais.
 *
 * Idempotente: só escreve o que mudou, e não escreve nada quando está tudo
 * certo — o job roda de minuto em minuto e não pode encher o banco de
 * versões de preço iguais. Avisa a loja só quando alguma coisa mudou: as
 * faixas, ou a foto dos preços.
 */
export async function sincronizarPrecosPorQuantidade(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)

  const { data: produtos } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata", "variants.id", "variants.price_set.id"],
    filters: { status: ProductStatus.PUBLISHED },
  })

  // variação ↔ conjunto de preços, só dos produtos de verdade (kit fica de fora)
  const variantePorConjunto = new Map<string, string>()
  for (const produto of produtos) {
    const meta = produto.metadata as { tipo?: unknown } | null
    if (meta?.tipo === KIT_DE_QUANTIDADE) continue
    for (const variante of produto.variants ?? []) {
      const conjunto = variante?.price_set?.id
      if (variante?.id && conjunto) variantePorConjunto.set(conjunto, variante.id)
    }
  }

  // O preço de UMA unidade hoje, com promoção. Sem `quantity` no contexto o
  // Medusa só considera preço de faixa que começa em 1 — as nossas começam
  // em 2, então esta conta nunca lê o próprio resultado.
  const conjuntos = [...variantePorConjunto.keys()]
  const atuais = conjuntos.length
    ? await pricing.calculatePrices({ id: conjuntos }, { context: { currency_code: MOEDA } })
    : []

  // A foto desta rodada contra a da anterior — ver "POR QUE DE MINUTO EM MINUTO".
  const todasAsListas = await pricing.listPriceLists(
    {},
    { select: ["id", "title", "status", "starts_at", "ends_at"], take: 1000 }
  )
  const foto = fotoDosPrecos(atuais, todasAsListas)
  const precosMudaram = fotoAnterior !== null && foto !== fotoAnterior
  fotoAnterior = foto
  const avisar = async (faixasMudaram: boolean) => {
    if (faixasMudaram || precosMudaram) await avisarALoja(ETIQUETAS_DE_PRECO, logger, "seconds")
  }

  const desejados = new Map<string, PrecoDesejado>()
  for (const atual of atuais) {
    const variante = variantePorConjunto.get(atual.id)
    const preco = emNumero(atual.calculated_amount)
    if (!variante || !preco) continue
    for (const faixa of FAIXAS) {
      const unitario = unitarioDaFaixa(preco, faixa.unidades, faixa.desconto)
      if (unitario === null) continue
      desejados.set(chave(atual.id, faixa.unidades, faixa.ate), {
        variant_id: variante,
        amount: unitario,
        min_quantity: faixa.unidades,
        max_quantity: faixa.ate,
      })
    }
  }

  // Pelo título: lista de preço não tem metadata nem handle. `q` é busca por
  // trecho, então a conferência exata vem depois.
  const lista = (await pricing.listPriceLists({ q: TITULO_DA_LISTA })).find(
    (l) => l.title === TITULO_DA_LISTA
  )

  if (!lista) {
    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: TITULO_DA_LISTA,
            description:
              "Gerada pelo backend (lib/precos-por-quantidade.ts): 4% levando 2, 6% levando 3 " +
              "ou mais. Não edite à mão — o job refaz a cada minuto.",
            // Sem `type`: o padrão do Medusa é "sale", que é o que faz ele
            // ficar com o MENOR preço entre esta lista e as outras.
            status: PriceListStatus.ACTIVE,
            prices: [...desejados.values()].map((p) => ({ ...p, currency_code: MOEDA })),
          },
        ],
      },
    })
    logger.info(`[quantidade] lista criada com ${desejados.size} preço(s)`)
    await avisar(desejados.size > 0)
    return { criados: desejados.size, atualizados: 0, removidos: 0 }
  }

  const existentes = await pricing.listPrices(
    { price_list_id: [lista.id] },
    { select: ["id", "amount", "min_quantity", "max_quantity", "price_set_id"] }
  )

  const create: (PrecoDesejado & { currency_code: string })[] = []
  const update: (PrecoDesejado & { id: string; currency_code: string })[] = []
  const remover: string[] = []
  const vistos = new Set<string>()

  for (const preco of existentes) {
    const k = chave(
      preco.price_set_id ?? "",
      emNumero(preco.min_quantity),
      emNumero(preco.max_quantity)
    )
    const desejado = desejados.get(k)
    // Faixa que não existe mais, variação que saiu, ou preço repetido na
    // mesma faixa: sai. Dois preços na mesma faixa fariam o Medusa escolher
    // o menor, que pode ser o velho.
    if (!desejado || vistos.has(k)) {
      remover.push(preco.id)
      continue
    }
    vistos.add(k)
    if (emNumero(preco.amount) !== desejado.amount) {
      /*
        A FAIXA VAI JUNTO, mesmo sem ter mudado. O Medusa junta as
        atualizações de um lote por moeda + conjunto + lista + faixa — só dos
        campos que vierem no pedido. Mandando só `id` e valor, as duas faixas
        da mesma variação viravam uma coisa só e a segunda engolia a primeira:
        o preço de 2 mudava e o de 3 ficava velho (visto no teste local).
      */
      update.push({ ...desejado, id: preco.id, currency_code: MOEDA })
    }
  }
  for (const [k, desejado] of desejados) {
    if (!vistos.has(k)) create.push({ ...desejado, currency_code: MOEDA })
  }

  if (!create.length && !update.length && !remover.length) {
    await avisar(false)
    return { criados: 0, atualizados: 0, removidos: 0 }
  }

  await batchPriceListPricesWorkflow(container).run({
    input: { data: { id: lista.id, create, update, delete: remover } },
  })
  logger.info(
    `[quantidade] ${create.length} criado(s), ${update.length} atualizado(s), ` +
      `${remover.length} removido(s)`
  )
  await avisar(true)
  return { criados: create.length, atualizados: update.length, removidos: remover.length }
}
