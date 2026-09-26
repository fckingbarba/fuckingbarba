import { model } from "@medusajs/framework/utils"

/**
 * Um pedido de aviso: "me avisa quando este produto voltar".
 *
 * SÓ O E-MAIL E O PRODUTO, que é o que a Política de Privacidade promete
 * ("Se você pedir aviso de um produto esgotado"). A data do pedido fica
 * porque é a prova de que a pessoa pediu — na LGPD (art. 8º, § 2º), provar o
 * consentimento é obrigação de quem guarda o dado.
 *
 * UM AVISO SÓ, E O E-MAIL SAI DAQUI: quando o produto volta e o e-mail sai,
 * a linha fica com `avisado_em` e SEM o e-mail — o painel conta quantos
 * foram avisados, e ninguém guarda um endereço cuja finalidade acabou. O que
 * espera demais (`EXPIRA_EM_DIAS`, em `lib/avise-me.ts`) é apagado, e o
 * avisado some depois de `GUARDA_EM_DIAS`.
 *
 * O ÍNDICE ÚNICO é de quem ainda espera: a mesma pessoa pedindo o mesmo
 * produto duas vezes é um aviso; depois de avisada, se ele esgotar de novo,
 * ela pode pedir outro.
 */
export const Aviso = model
  .define("aviso_de_estoque", {
    id: model.id({ prefix: "avis" }).primaryKey(),
    /** Minúsculo, sem espaço (`normalizarEmail`). `null` depois de avisado. */
    email: model.text().nullable(),
    variante_id: model.text(),
    /** Pra contar por produto no painel sem ir no catálogo. */
    produto_id: model.text(),
    consentido_em: model.dateTime(),
    avisado_em: model.dateTime().nullable(),
    /** Tentativas de e-mail que não passaram (o Resend fora, o endereço recusado). */
    falhas: model.number().default(0),
  })
  .indexes([
    {
      on: ["email", "variante_id"],
      unique: true,
      where: "email IS NOT NULL AND deleted_at IS NULL",
    },
    { on: ["variante_id"], where: "deleted_at IS NULL" },
    { on: ["produto_id"], where: "deleted_at IS NULL" },
  ])
