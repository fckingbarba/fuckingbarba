import { model } from "@medusajs/framework/utils"

/**
 * QUEM INDICA (entrega 0215, o "Indique um brother" — `lib/crm/indicacao.ts`)
 * — o link de cada pessoa: o código (`BROTHER-7KQ2MX`) e a promoção do
 * Medusa que ele é (15% na 1ª compra de quem usar, uma vez por pessoa). Nasce
 * no primeiro convite da jornada, ou quando a pessoa pede o link em Minha
 * conta. Um por e-mail, pra sempre.
 *
 * Quem comprou com o link, e o cupom que quem indicou ganhou, moram no
 * registro dos fluxos (`crm_envio`, o fluxo `indicacao`, a chave
 * `premio|<pedido>`).
 */
export const Indicador = model
  .define("crm_indicador", {
    id: model.id({ prefix: "ind" }).primaryKey(),
    email: model.text(),
    codigo: model.text(),
    promocao_id: model.text(),
  })
  .indexes([
    { on: ["email"], unique: true },
    { on: ["codigo"], unique: true },
  ])
