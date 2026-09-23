import { createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  ContainerRegistrationKeys,
  ProductStatus,
  PromotionRuleOperator,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { createPromotionsWorkflow, updatePromotionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * A OFERTA DO CHECKOUT — o "order bump" — tem desconto em QUALQUER produto.
 *
 * Quem escolhe o produto oferecido é o motor de recomendação
 * (`lib/recomendacao.ts`, e a loja em `apps/loja/src/lib/recomendacao.ts`),
 * carrinho a carrinho. O desconto, então, não pode morar num produto só: cada
 * produto publicado ganha a própria promoção, e a loja aplica o código do
 * produto que ofereceu quando a pessoa marca a caixinha.
 *
 * ┌─ POR QUE UMA PROMOÇÃO POR PRODUTO ─────────────────────────────────────┐
 * │ Uma promoção só, valendo pra todos os produtos, daria 10% em TODAS as  │
 * │ linhas do carrinho — não só na da oferta. A regra de alvo do Medusa é  │
 * │ por produto, e é ela que prende o desconto na linha certa.             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O CÓDIGO TEM UM PEDAÇO SECRETO ───────────────────────────────┐
 * │ Código é cupom, e cupom se aplica direto na API do Medusa, sem passar  │
 * │ pela tela. Com um código adivinhável ("BUMP-OLEO-PARA-BARBA"), quem    │
 * │ descobrisse o padrão aplicaria um por produto e levaria 10% em tudo.   │
 * │ O final do código é uma assinatura do `REVALIDAR_SEGREDO` — o segredo  │
 * │ que a loja e o Medusa já dividem —, e a loja calcula o mesmo código do │
 * │ lado dela (`apps/loja/src/lib/bump.ts`). Quem vê o código é quem       │
 * │ marcou a caixinha, e aí o desconto é o que a tela já tinha oferecido.  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O id do produto entra na assinatura: produto apagado e recriado com o
 * mesmo handle ganha código novo, e a promoção velha — que aponta pro id
 * velho e não descontaria nada — é desligada na mesma rodada.
 *
 * Cada promoção desconta UMA unidade (`max_quantity: 1`): quem marca a
 * oferta e depois sobe a quantidade pra dez não leva as dez com desconto.
 *
 * O job `bumps` roda isto de hora em hora: produto novo ganha a promoção,
 * produto despublicado perde (fica inativa), e desconto diferente do de
 * baixo é corrigido. O `BUMP-OLEO` antigo (20%, só o óleo) cai junto: o
 * código dele não é de produto nenhum.
 */

/** Em porcentagem. O MESMO NÚMERO ESTÁ NA LOJA, em `apps/loja/src/conteudo/checkout.ts`. */
export const DESCONTO_DO_BUMP = 10

export const PREFIXO_DO_BUMP = "BUMP-"

/**
 * Os kits de quantidade ("2 frascos", "3 frascos") eram produtos à parte e
 * foram aposentados (`lib/precos-por-quantidade.ts`) — mas um que ainda
 * esteja publicado não vira oferta nem sugestão: é o mesmo produto de novo.
 */
export const ehKitDeQuantidade = (metadata: unknown) =>
  (metadata as { tipo?: unknown } | null | undefined)?.tipo === "kit-quantidade"

/**
 * "oleo-para-barba" → "BUMP-OLEO-PARA-BARBA-3F9A12C7".
 *
 * O handle fica legível de propósito — é ele que diz, no painel e no
 * resumo do pedido, de que produto era a oferta. O final são oito letras da
 * assinatura. A loja faz a MESMA conta (`apps/loja/src/lib/bump.ts`).
 */
export function codigoDoBump(handle: string, produtoId: string, segredo: string): string {
  const assinatura = createHmac("sha256", segredo)
    .update(`bump:${handle}:${produtoId}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
  return `${PREFIXO_DO_BUMP}${handle.toUpperCase()}-${assinatura}`
}

type Promocao = {
  id: string
  code: string | null
  status: string | null
  application_method?: { value?: unknown; max_quantity?: unknown } | null
}

export type ProdutoComBump = { id: string; handle: string }

/** Os produtos que têm (ou deveriam ter) oferta: publicados, menos os kits de quantidade. */
export async function produtosComBump(container: MedusaContainer): Promise<ProdutoComBump[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { status: ProductStatus.PUBLISHED },
  })
  return data.flatMap((p) => {
    if (!p.handle || ehKitDeQuantidade(p.metadata)) return []
    return [{ id: p.id, handle: p.handle }]
  })
}

/** As promoções de bump que existem, ativas ou não. */
export async function promocoesDeBump(container: MedusaContainer): Promise<Promocao[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "status", "application_method.value", "application_method.max_quantity"],
  })
  return (data as Promocao[]).filter((p) => p.code?.startsWith(PREFIXO_DO_BUMP))
}

/**
 * Os handles com oferta VALENDO agora — é o que o motor pode oferecer.
 *
 * Produto novo fica de fora até o job criar a promoção dele: oferecer um
 * desconto que o Medusa não daria é a caixinha que marca e desmarca.
 */
export async function handlesComBumpAtivo(container: MedusaContainer): Promise<Set<string>> {
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!segredo) return new Set()
  const [produtos, promocoes] = await Promise.all([
    produtosComBump(container),
    promocoesDeBump(container),
  ])
  const ativas = new Set(
    promocoes.filter((p) => p.status === PromotionStatus.ACTIVE).map((p) => p.code)
  )
  return new Set(
    produtos.filter((p) => ativas.has(codigoDoBump(p.handle, p.id, segredo))).map((p) => p.handle)
  )
}

export async function sincronizarBumps(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const segredo = process.env.REVALIDAR_SEGREDO
  if (!segredo) {
    logger.warn(
      "[bumps] sem REVALIDAR_SEGREDO: não dá pra assinar os códigos, e o checkout fica sem oferta"
    )
    return { criadas: 0, corrigidas: 0, desligadas: 0, produtos: 0 }
  }

  const [produtos, existentes] = await Promise.all([
    produtosComBump(container),
    promocoesDeBump(container),
  ])
  const porCodigo = new Map(existentes.map((p) => [p.code as string, p]))
  const desejados = new Map(produtos.map((p) => [codigoDoBump(p.handle, p.id, segredo), p]))

  let criadas = 0
  let corrigidas = 0
  let desligadas = 0

  for (const [codigo, produto] of desejados) {
    const existente = porCodigo.get(codigo)
    try {
      if (!existente) {
        await createPromotionsWorkflow(container).run({
          input: {
            promotionsData: [
              {
                code: codigo,
                type: PromotionType.STANDARD,
                status: PromotionStatus.ACTIVE,
                // Código, não automática: vale só quando a pessoa marca a caixinha.
                is_automatic: false,
                application_method: {
                  type: ApplicationMethodType.PERCENTAGE,
                  target_type: ApplicationMethodTargetType.ITEMS,
                  allocation: ApplicationMethodAllocation.EACH,
                  value: DESCONTO_DO_BUMP,
                  max_quantity: 1,
                  target_rules: [
                    {
                      attribute: "items.product.id",
                      operator: PromotionRuleOperator.IN,
                      values: [produto.id],
                    },
                  ],
                },
              },
            ],
          },
        })
        criadas++
        continue
      }

      const certa =
        existente.status === PromotionStatus.ACTIVE &&
        Number(existente.application_method?.value) === DESCONTO_DO_BUMP &&
        Number(existente.application_method?.max_quantity) === 1
      if (!certa) {
        await updatePromotionsWorkflow(container).run({
          input: {
            promotionsData: [
              {
                id: existente.id,
                status: PromotionStatus.ACTIVE,
                // Sem `id`: o Medusa acha o método de aplicação pela promoção
                // (o mesmo cuidado do `scripts/promocoes.ts`).
                application_method: {
                  type: ApplicationMethodType.PERCENTAGE,
                  target_type: ApplicationMethodTargetType.ITEMS,
                  allocation: ApplicationMethodAllocation.EACH,
                  value: DESCONTO_DO_BUMP,
                  max_quantity: 1,
                },
              },
            ],
          },
        })
        corrigidas++
      }
    } catch (e) {
      // Um produto não segura os outros. O caso esperado é duas rodadas ao
      // mesmo tempo criando o mesmo código — o código é único, e a segunda
      // perde; a promoção existe do mesmo jeito.
      logger.warn(`[bumps] ${codigo}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Código de bump sem produto por trás (despublicado, recriado, o BUMP-OLEO
  // antigo): inativo, e não apagado — pedido antigo que usou o código
  // continua apontando pra uma promoção que existe.
  for (const [codigo, existente] of porCodigo) {
    if (desejados.has(codigo) || existente.status !== PromotionStatus.ACTIVE) continue
    try {
      await updatePromotionsWorkflow(container).run({
        input: { promotionsData: [{ id: existente.id, status: PromotionStatus.INACTIVE }] },
      })
      desligadas++
    } catch (e) {
      logger.warn(`[bumps] desligar ${codigo}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (criadas || corrigidas || desligadas) {
    logger.info(
      `[bumps] ${criadas} criada(s), ${corrigidas} corrigida(s), ${desligadas} desligada(s) — ` +
        `${DESCONTO_DO_BUMP}% em ${desejados.size} produto(s)`
    )
  }
  return { criadas, corrigidas, desligadas, produtos: desejados.size }
}
