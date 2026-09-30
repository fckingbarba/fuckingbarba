import { model } from "@medusajs/framework/utils"

/**
 * QUEM ENTRA NO PAINEL DA LOJA — uma linha por pessoa da equipe.
 *
 * O e-mail é o de entrar (o código vai pra ele) e não muda: pra trocar, o
 * dono remove e convida o novo. Remover não apaga a linha — a situação vira
 * `removido`, o registro de quem fez o quê continua apontando pra ela, e
 * convidar o mesmo e-mail de novo reaproveita a linha.
 *
 * `convidado` é quem ainda não entrou; vira `ativo` no primeiro código
 * confirmado. O convite vale 7 dias (`lib/equipe/regras.ts`).
 *
 * O `papel` é `dono`, `operacao`, `marketing` ou o id de um papel criado
 * pelo dono (`equipe_papel`, `papel_01K…`) — texto, e não enum, por isso.
 */
export const Membro = model.define("equipe_membro", {
  id: model.id({ prefix: "eqp" }).primaryKey(),
  email: model.text().unique(),
  nome: model.text(),
  papel: model.text(),
  situacao: model.enum(["convidado", "ativo", "removido"]).default("convidado"),
  convidado_em: model.dateTime().nullable(),
  /** O id do membro que convidou — `null` pro dono que veio do `DASHBOARD_DONO_EMAIL`. */
  convidado_por: model.text().nullable(),
  entrou_em: model.dateTime().nullable(),
  ultimo_acesso: model.dateTime().nullable(),
})
