import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { sincronizarPrecosPorQuantidade } from "../lib/precos-por-quantidade"
import { avisarALoja } from "../lib/revalidar"
import { ondeEstou } from "./onde-estou"

/**
 * LIGA O DESCONTO POR QUANTIDADE e aposenta os kits — uma vez, na virada.
 *
 *   npm install && npm run backend:quantidade
 *
 * ONDE ISSO ESCREVE: no banco do `DATABASE_URL` que estiver valendo, como os
 * outros scripts (a primeira linha do log diz qual). Pra produção, rodar no
 * Shell do serviço no Railway, de `.medusa/server`:
 *
 *   npx medusa exec ./src/scripts/precos-por-quantidade.js
 *
 * O QUE FAZ:
 *   1. monta a lista "Desconto por quantidade" (lib/precos-por-quantidade.ts)
 *      — o mesmo que o job faz de minuto em minuto, só que agora;
 *   2. passa pra RASCUNHO os produtos-kit ("Kit 2 frascos — …"), que a página
 *      não usa mais. Rascunho e não apagar: pedido antigo aponta pra eles.
 *
 * Roda quantas vezes quiser: o que já está certo fica como está.
 */
export default async function precosPorQuantidade({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "quantidade")

  const r = await sincronizarPrecosPorQuantidade(container)
  logger.info(
    `[quantidade] lista: ${r.criados} criado(s), ${r.atualizados} atualizado(s), ` +
      `${r.removidos} removido(s)`
  )

  const { data: publicados } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { status: ProductStatus.PUBLISHED },
  })
  const kits = publicados.filter(
    (p) => (p.metadata as { tipo?: unknown } | null)?.tipo === "kit-quantidade"
  )

  if (!kits.length) {
    logger.info("[quantidade] nenhum kit publicado — nada pra aposentar")
    return
  }

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: kits.map((k) => k.id) },
      update: { status: ProductStatus.DRAFT },
    },
  })
  logger.info(
    `[quantidade] ${kits.length} kit(s) em rascunho: ${kits.map((k) => k.handle).join(", ")}`
  )
  await avisarALoja(["produtos"], logger)
}
