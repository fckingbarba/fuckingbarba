import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, PriceListStatus } from "@medusajs/framework/utils"
import {
  batchPriceListPricesWorkflow,
  createPriceListsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARCA_DO_PRECO } from "../erp/marcas"
import { sincronizarPrecosPorQuantidade, TITULO_DA_LISTA } from "../precos-por-quantidade"
import { avisarALoja } from "../revalidar"
import { tagsDoProduto } from "./gravar-produto"
import { TITULO_DA_PROMOCAO, type MudancaDePreco } from "./promocao"

/**
 * O PREÇO E O PROMOCIONAL GRAVADOS PELO PAINEL (a regra está em
 * `promocao.ts`). Uma gravação por vez, na trava: duas pessoas salvando ao
 * mesmo tempo, a primeira criaria a lista da promoção e a segunda outra
 * igual.
 *
 * O PREÇO vai pra variação (todas as do produto, com o mesmo valor), e o
 * produto ganha a marca `fb_preco`: a importação do Bling não troca mais.
 * O PROMOCIONAL vai pra lista "Promoção do painel" — e sai das outras.
 *
 * DEPOIS DE GRAVAR, na hora: a loja é avisada (a página e a vitrine mudam em
 * segundos) e o desconto por quantidade é refeito — sem esperar o job do
 * minuto, pra "2 unidades" já sair do preço novo.
 */

const MOEDA = "brl"
const TRAVA = "preco-do-painel"

/** A lista do painel, pelo título (lista de preço não tem metadata nem handle). */
export async function acharListaDaPromocao(
  container: MedusaContainer
): Promise<{ id: string } | null> {
  const listas = await container
    .resolve(Modules.PRICING)
    .listPriceLists({}, { select: ["id", "title"], take: 1000 })
  return listas.find((l) => l.title === TITULO_DA_PROMOCAO) ?? null
}

export type ProdutoDoPreco = {
  id: string
  handle?: string | null
  variants?: ({ id: string; price_set?: { id?: string | null } | null } | null)[] | null
}

export type PrecoGravado = { ok: true; lojaAvisada: boolean } | { ok: false; motivo: string }

/**
 * Grava o que mudou (`lerMudancaDePreco` já conferiu): o preço, se veio, e
 * o promocional, se veio (`null` tira).
 */
export async function gravarPreco(
  container: MedusaContainer,
  produto: ProdutoDoPreco,
  mudanca: MudancaDePreco
): Promise<PrecoGravado> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const variantes = (produto.variants ?? []).flatMap((v) =>
    v?.id && v.price_set?.id ? [{ id: v.id, conjunto: v.price_set.id }] : []
  )
  if (!variantes.length) return { ok: false, motivo: "sem_preco" }
  const nome = produto.handle ?? produto.id
  const { preco, promocional } = mudanca

  await container.resolve(Modules.LOCKING).execute(
    TRAVA,
    async () => {
      if (preco !== null) {
        await updateProductVariantsWorkflow(container).run({
          input: {
            product_variants: variantes.map((v) => ({
              id: v.id,
              prices: [{ amount: preco, currency_code: MOEDA }],
            })),
          },
        })
        // O metadata é juntado raso pelo Medusa: as outras chaves ficam.
        await updateProductsWorkflow(container).run({
          input: {
            selector: { id: produto.id },
            update: {
              metadata: { [MARCA_DO_PRECO]: { origem: "painel", em: new Date().toISOString() } },
            },
          },
        })
        logger.info(`[preço] ${nome}: R$ ${emTexto(preco)} (do painel)`)
      }
      if (promocional !== undefined)
        await gravarPromocional(container, nome, variantes, promocional)
    },
    { timeout: 30 }
  )

  const aviso = produto.handle
    ? await avisarALoja(tagsDoProduto(produto.handle), logger, "seconds")
    : { avisou: false }
  // O job do minuto também refaria; aqui é pra "2 unidades" não ficar um minuto com o preço velho.
  await sincronizarPrecosPorQuantidade(container).catch((e) =>
    logger.warn(
      `[preço] o desconto por quantidade fica pro job do minuto: ${e instanceof Error ? e.message : e}`
    )
  )
  return { ok: true, lojaAvisada: aviso.avisou }
}

const emTexto = (v: number) => v.toFixed(2).replace(".", ",")

/** O promocional: sai das outras listas e entra (ou sai) da do painel. Dentro da trava. */
async function gravarPromocional(
  container: MedusaContainer,
  nome: string,
  variantes: { id: string; conjunto: string }[],
  por: number | null
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pricing = container.resolve(Modules.PRICING)
  const conjuntos = variantes.map((v) => v.conjunto)
  const listas = await pricing.listPriceLists({}, { select: ["id", "title"], take: 1000 })
  let nossa = listas.find((l) => l.title === TITULO_DA_PROMOCAO) ?? null

  // O painel manda no "de/por": o preço deste produto sai das outras listas.
  // A do desconto por quantidade fica — é o job que escreve nela.
  for (const outra of listas) {
    if (outra.title === TITULO_DA_LISTA || outra.id === nossa?.id) continue
    const precos = await pricing.listPrices(
      { price_list_id: [outra.id], price_set_id: conjuntos },
      { select: ["id"], take: 500 }
    )
    if (!precos.length) continue
    await batchPriceListPricesWorkflow(container).run({
      input: { data: { id: outra.id, create: [], update: [], delete: precos.map((p) => p.id) } },
    })
    logger.info(`[preço] ${nome} saiu da lista “${outra.title ?? outra.id}”`)
  }

  if (!nossa && por === null) return
  if (!nossa) {
    const { result } = await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: TITULO_DA_PROMOCAO,
            description:
              "Gerada pelo painel (Produtos → Promocional): o “por” do de/por. Não edite à " +
              "mão — o painel reescreve.",
            // Sem `type`: o padrão do Medusa é "sale" — fica o MENOR preço.
            status: PriceListStatus.ACTIVE,
            prices: [],
          },
        ],
      },
    })
    nossa = { id: result[0]!.id, title: TITULO_DA_PROMOCAO }
  }

  const existentes = await pricing.listPrices(
    { price_list_id: [nossa.id], price_set_id: conjuntos },
    { select: ["id", "price_set_id"], take: 500 }
  )
  const create: { variant_id: string; amount: number; currency_code: string }[] = []
  const update: { id: string; variant_id: string; amount: number; currency_code: string }[] = []
  const remover: string[] = []
  for (const v of variantes) {
    const [primeiro, ...repetidos] = existentes.filter((e) => e.price_set_id === v.conjunto)
    // Um preço por variação: repetido faria o Medusa ficar com o menor, que pode ser o velho.
    remover.push(...repetidos.map((r) => r.id))
    if (por === null) {
      if (primeiro) remover.push(primeiro.id)
    } else if (primeiro) {
      update.push({ id: primeiro.id, variant_id: v.id, amount: por, currency_code: MOEDA })
    } else {
      create.push({ variant_id: v.id, amount: por, currency_code: MOEDA })
    }
  }
  if (create.length || update.length || remover.length)
    await batchPriceListPricesWorkflow(container).run({
      input: { data: { id: nossa.id, create, update, delete: remover } },
    })
  logger.info(
    `[preço] ${nome}: ` + (por === null ? "sem promoção" : `promocional R$ ${emTexto(por)}`)
  )
}
