import { ExecArgs } from "@medusajs/framework/types"
import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  ContainerRegistrationKeys,
  MedusaError,
  PromotionRuleOperator,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { createPromotionsWorkflow, updatePromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * AS PROMOÇÕES — quem desconta é o Medusa, não a tela.
 *
 *   npm install && npm run backend:promocoes
 *
 * ┌─ POR QUE ISTO EXISTE ──────────────────────────────────────────────────┐
 * │ O checkout tem um ORDER BUMP: uma caixinha colada no botão de pagar    │
 * │ que oferece um produto com desconto. Escrever "de R$ 54,90 por         │
 * │ R$ 43,90" na tela e deixar o Medusa cobrar R$ 54,90 é a diferença que  │
 * │ o cliente descobre na fatura — e, no Brasil, oferta anunciada vincula  │
 * │ (CDC art. 30). Então o desconto EXISTE no backend, e a tela só mostra  │
 * │ o que o Medusa confirmou.                                             │
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
 * Se alguém descobrir o código e usar fora do checkout, o estrago é o próprio
 * desconto do bump num produto só — que é o que a loja já estava oferecendo.
 *
 * Roda quantas vezes quiser: o que já existe é ATUALIZADO, não duplicado.
 */

/* ─────────────────────────────────────────────────────────────────────────
   O QUE A LOJA OFERECE. Trocar aqui, rodar de novo.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * O produto do order bump e quanto ele desconta.
 *
 * `handle` é o do produto no catálogo; `desconto` é em PORCENTAGEM.
 *
 * O MESMO NÚMERO ESTÁ NA LOJA, em `apps/loja/src/conteudo/checkout.ts`. Os
 * dois precisam bater — o conferidor monta um carrinho de verdade, aplica o
 * código e confere que o desconto que o Medusa deu é o que a tela promete.
 */
const BUMP = {
  handle: "oleo-para-barba",
  desconto: 20,
  codigo: "BUMP-OLEO",
  /** Aparece só no painel, pra quem for olhar o relatório depois. */
  descricao: "Order bump do checkout — óleo com 20% off na hora de fechar",
}

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

type ParaCriar = {
  codigo: string
  desconto: number
  descricao: string
  /** id do produto, quando a promoção vale só pra ele. */
  produtoId?: string
}

export default async function promocoes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "promocoes")

  // ── o produto do bump precisa existir ───────────────────────────────────
  const { data: produtos } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title"],
    filters: { handle: BUMP.handle },
  })
  const produto = produtos[0]
  if (!produto) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Não achei o produto "${BUMP.handle}" pro order bump. Confira o handle no ` +
        `topo de src/scripts/promocoes.ts, ou rode o produtos-iniciais antes.`
    )
  }

  const desejadas: ParaCriar[] = [
    { ...BUMP, produtoId: produto.id },
    ...CUPONS.map((c) => ({ ...c })),
  ]

  // ── o que já existe ─────────────────────────────────────────────────────
  const { data: existentes } = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "application_method.id"],
  })
  const porCodigo = new Map(existentes.map((p) => [p.code, p]))

  for (const promo of desejadas) {
    const jaTem = porCodigo.get(promo.codigo)

    /**
     * `allocation: EACH` com `max_quantity: 1` desconta UMA unidade.
     *
     * Sem o limite, quem marcasse o bump e depois subisse a quantidade pra
     * dez levaria as dez com desconto — "só nessa tela" viraria atacado.
     */
    const metodo = {
      type: ApplicationMethodType.PERCENTAGE,
      target_type: ApplicationMethodTargetType.ITEMS,
      allocation: ApplicationMethodAllocation.EACH,
      value: promo.desconto,
      max_quantity: promo.produtoId ? 1 : undefined,
      description: promo.descricao,
      // Sem regra de alvo, a promoção vale pro carrinho inteiro — que é o
      // comportamento certo pra cupom e errado pro bump.
      target_rules: promo.produtoId
        ? [
            {
              attribute: "items.product.id",
              operator: PromotionRuleOperator.IN,
              values: [promo.produtoId],
            },
          ]
        : [],
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
                max_quantity: metodo.max_quantity,
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
            // Código, não automática: o bump só vale quando a pessoa marca a
            // caixinha, e o cupom só quando alguém digita.
            is_automatic: false,
            application_method: metodo,
          },
        ],
      },
    })
    logger.info(
      `[promocoes] ${promo.codigo} criada: ${promo.desconto}% off` +
        (promo.produtoId ? ` em "${produto.title}", 1 unidade` : " no carrinho")
    )
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
