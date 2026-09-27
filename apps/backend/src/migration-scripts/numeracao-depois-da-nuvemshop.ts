import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * OS PEDIDOS DA LOJA NOVA DEPOIS DOS DA NUVEMSHOP — roda UMA vez, sozinho,
 * no `medusa db:migrate` do deploy (entrega 0159, a virada do domínio).
 *
 * Decidido: nada de dois "#28". O último pedido da loja antiga foi o #3194
 * (27/09, 11h); a loja nova numera do #3301 em diante — a folga cobre o que
 * a Nuvemshop ainda receber até o domínio virar pra todo mundo. O número é
 * o `display_id` do Medusa (a sequência `order_display_id_seq`): o do
 * e-mail, do painel e do "FB-" no Bling. Se a sequência já estiver além,
 * fica onde está — nunca volta.
 */
export const PRIMEIRO_PEDIDO_DA_LOJA_NOVA = 3301

export default async function numeracaoDepoisDaNuvemshop({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const banco = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { rows } = await banco.raw(
    `select setval('order_display_id_seq',
       greatest((select last_value from order_display_id_seq), ?::bigint)) as ultimo`,
    [PRIMEIRO_PEDIDO_DA_LOJA_NOVA - 1]
  )
  logger.info(
    `[numeração] o próximo pedido da loja nova é o #${Number(rows?.[0]?.ultimo ?? 0) + 1}`
  )
}
