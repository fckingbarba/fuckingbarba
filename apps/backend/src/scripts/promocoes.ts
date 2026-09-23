import { ExecArgs } from "@medusajs/framework/types"
import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  ContainerRegistrationKeys,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { createPromotionsWorkflow, updatePromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { DESCONTO_DO_BUMP, sincronizarBumps } from "../lib/bumps"
import { ondeEstou } from "./onde-estou"

/**
 * AS PROMOÇÕES — quem desconta é o Medusa, não a tela.
 *
 *   npm install && npm run backend:promocoes
 *
 * ┌─ POR QUE ISTO EXISTE ──────────────────────────────────────────────────┐
 * │ O checkout tem um ORDER BUMP: uma caixinha colada no botão de pagar    │
 * │ que oferece um produto com desconto. Escrever "de R$ 54,90 por         │
 * │ R$ 49,41" na tela e deixar o Medusa cobrar R$ 54,90 é a diferença que  │
 * │ o cliente descobre na fatura — e, no Brasil, oferta anunciada vincula  │
 * │ (CDC art. 30). Então o desconto EXISTE no backend, e a tela só mostra  │
 * │ o que o Medusa confirmou.                                              │
 * │                                                                        │
 * │ O mesmo vale pro campo de cupom: ele manda o código pro Medusa e       │
 * │ mostra a resposta. Não existe lista de cupom no navegador — isso seria │
 * │ um desconto que qualquer um lê no código-fonte e aplica na mão.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O BUMP É UM CUPOM ESCONDIDO, e é de propósito: a promoção tem código, o
 * checkout aplica esse código quando a pessoa marca a caixinha, e remove
 * quando desmarca. Assim o desconto nasce e morre com a decisão dela, e não
 * fica valendo pra quem só passou pela tela.
 *
 * O PRODUTO DO BUMP NÃO É ESCOLHIDO AQUI: quem escolhe é o motor de
 * recomendação, carrinho a carrinho. Por isso cada produto publicado tem a
 * própria promoção, com código assinado — o porquê está em `lib/bumps.ts`,
 * e o job `bumps` mantém isso em dia de hora em hora. Este script roda a
 * mesma sincronização na hora, pra quem não quer esperar o job.
 *
 * Roda quantas vezes quiser: o que já existe é ATUALIZADO, não duplicado.
 */

/* ─────────────────────────────────────────────────────────────────────────
   O QUE A LOJA OFERECE. Trocar aqui, rodar de novo.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Cupons de campanha. Vazio de propósito: cupom é decisão comercial, e
 * inventar um aqui seria publicar um desconto que ninguém pediu.
 *
 * Pra criar um, siga o formato:
 *
 *     { codigo: "PRIMEIRA10", desconto: 10, descricao: "10% na primeira compra" }
 *
 * O desconto é percentual e vale sobre o total dos itens (não sobre o frete).
 */
const CUPONS: { codigo: string; desconto: number; descricao: string }[] = []

/* ───────────────────────────────────────────────────────────────────────── */

export default async function promocoes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "promocoes")

  // ── as ofertas do checkout, uma por produto ─────────────────────────────
  const bumps = await sincronizarBumps(container)
  logger.info(
    `[promocoes] oferta do checkout: ${DESCONTO_DO_BUMP}% em ${bumps.produtos} produto(s) ` +
      `(${bumps.criadas} criada(s), ${bumps.corrigidas} corrigida(s), ${bumps.desligadas} desligada(s))`
  )

  // ── os cupons de campanha — o que já existe ─────────────────────────────
  const { data: existentes } = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "application_method.id"],
  })
  const porCodigo = new Map(existentes.map((p) => [p.code, p]))

  for (const promo of CUPONS) {
    const jaTem = porCodigo.get(promo.codigo)

    // Sem regra de alvo, a promoção vale pro carrinho inteiro — que é o
    // comportamento certo pra cupom. (A do bump, com alvo e uma unidade só,
    // mora em `lib/bumps.ts`.)
    const metodo = {
      type: ApplicationMethodType.PERCENTAGE,
      target_type: ApplicationMethodTargetType.ITEMS,
      allocation: ApplicationMethodAllocation.EACH,
      value: promo.desconto,
      description: promo.descricao,
      target_rules: [],
    }

    if (jaTem) {
      await updatePromotionsWorkflow(container).run({
        input: {
          promotionsData: [
            {
              id: jaTem.id,
              status: PromotionStatus.ACTIVE,
              // Sem `id`: o Medusa acha o método de aplicação pela promoção e
              // o tipo dele proíbe mandar o id de volta.
              application_method: {
                type: metodo.type,
                target_type: metodo.target_type,
                allocation: metodo.allocation,
                value: metodo.value,
              },
            },
          ],
        },
      })
      logger.info(`[promocoes] ${promo.codigo} atualizada: ${promo.desconto}% off`)
      continue
    }

    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: promo.codigo,
            type: PromotionType.STANDARD,
            status: PromotionStatus.ACTIVE,
            // Código, não automática: o cupom só vale quando alguém digita.
            is_automatic: false,
            application_method: metodo,
          },
        ],
      },
    })
    logger.info(`[promocoes] ${promo.codigo} criada: ${promo.desconto}% off no carrinho`)
  }

  if (!CUPONS.length) {
    logger.info(
      "[promocoes] nenhum cupom de campanha cadastrado — a lista CUPONS está vazia de propósito"
    )
  }
  logger.info(
    "[promocoes] LEMBRE: o desconto do bump também está escrito na loja, em " +
      "apps/loja/src/conteudo/checkout.ts. Os dois precisam bater."
  )
}
