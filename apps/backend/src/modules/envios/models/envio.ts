import { model } from "@medusajs/framework/utils"
import { Evento } from "./evento"

/**
 * UM ENVIO — um pacote na rua, com o código de rastreio dele.
 *
 * Um pedido costuma ter um; pode ter dois (a caixa que não coube) ou
 * nenhum ainda. E pode existir envio SEM pedido: o aviso que chegou do
 * parceiro antes de a loja cadastrar o código no pedido (ou de um pedido de
 * outra loja na mesma conta da Frenet). Ele fica guardado e se liga sozinho
 * no dia em que o código aparecer num pedido — ver `nucleo.ts`.
 *
 * `pedido_id` e `fulfillment_id` são texto, e não link do Medusa, de
 * propósito: o núcleo acha os envios de um pedido por aqui, e a rota da
 * conta já sabe o pedido. Link seria mais uma tabela e mais uma migração
 * que pode falhar no deploy, pra nenhuma consulta a mais.
 */
export const Envio = model
  .define("envio", {
    id: model.id({ prefix: "env" }).primaryKey(),
    pedido_id: model.text().nullable(),
    /** O fulfillment do Medusa que este envio marcou como postado. */
    fulfillment_id: model.text().nullable(),
    /** Quem fala por este pacote: "frenet", ou "loja" (o admin cadastrou o código). */
    parceiro: model.text(),
    /** O id do envio no parceiro (o `ShipmentId` da Frenet). */
    id_no_parceiro: model.text().nullable(),
    /** Como o parceiro chama o pedido (o `OrderId`), do jeito que veio. */
    referencia: model.text().nullable(),
    codigo: model.text().nullable(),
    url: model.text().nullable(),
    transportadora: model.text().nullable(),
    servico: model.text().nullable(),
    /** O resumo dos eventos (`resumir`, em `lib/envios/situacao.ts`). */
    situacao: model.text().default("aguardando"),
    alerta: model.text().nullable(),
    /** A hora (da transportadora) em que a situação de agora começou. */
    desde: model.dateTime().nullable(),
    postado_em: model.dateTime().nullable(),
    entregue_em: model.dateTime().nullable(),
    /** O que já foi avisado ao cliente: `{ enviado: { em, como } }`. */
    avisos: model.json().nullable(),
    /** Por que o Medusa ainda não reflete este envio (o job tenta de novo). */
    pendencia: model.text().nullable(),
    eventos: model.hasMany(() => Evento, { mappedBy: "envio" }),
  })
  .indexes([
    { on: ["pedido_id"], where: "deleted_at IS NULL" },
    /* Um código, um pacote — é por ele que o aviso do parceiro e o cadastro
       do admin se encontram. */
    { on: ["codigo"], unique: true, where: "codigo IS NOT NULL AND deleted_at IS NULL" },
    {
      on: ["parceiro", "id_no_parceiro"],
      unique: true,
      where: "id_no_parceiro IS NOT NULL AND deleted_at IS NULL",
    },
  ])
  .cascades({ delete: ["eventos"] })
