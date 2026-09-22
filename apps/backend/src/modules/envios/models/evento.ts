import { model } from "@medusajs/framework/utils"
import { Envio } from "./envio"

/**
 * UM EVENTO DA LINHA DO TEMPO de um envio — "saiu pra entrega, 09:12,
 * Joinville-SC". O `tipo` é do vocabulário do núcleo; a `descricao` é o
 * texto da transportadora, que é o que o cliente lê.
 *
 * `chave` reconhece o repetido (tipo, hora e texto): parceiro reenvia, e o
 * mesmo evento duas vezes na tela é o tipo de defeito que faz a pessoa
 * desconfiar do resto.
 */
export const Evento = model
  .define("envio_evento", {
    id: model.id({ prefix: "enve" }).primaryKey(),
    tipo: model.text(),
    descricao: model.text(),
    local: model.text().nullable(),
    /** A hora do fato, na transportadora. */
    quando: model.dateTime(),
    /** "parceiro" (veio no aviso) ou "loja" (o admin marcou no Medusa). */
    origem: model.text(),
    chave: model.text(),
    /** O evento como o parceiro mandou. Auditoria; nunca vai pra tela. */
    bruto: model.json().nullable(),
    envio: model.belongsTo(() => Envio, { mappedBy: "eventos" }),
  })
  .indexes([{ on: ["envio_id", "chave"], unique: true, where: "deleted_at IS NULL" }])
