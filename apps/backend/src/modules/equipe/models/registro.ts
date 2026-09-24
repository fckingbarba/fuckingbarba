import { model } from "@medusajs/framework/utils"

/**
 * QUEM FEZ O QUÊ NO PAINEL, E QUANDO.
 *
 * Com mais de uma pessoa mexendo na loja, é a primeira pergunta depois de
 * um erro. Uma linha por ação: quem fez (`membro_id`), o quê (`acao`, um
 * código curto como `convidou` ou `removeu`), em quem ou em quê (`alvo_id`) e
 * o detalhe que ajuda a entender depois. A hora é o `created_at`.
 *
 * Nunca se apaga nem se edita — só se escreve.
 */
export const Registro = model
  .define("equipe_registro", {
    id: model.id({ prefix: "eqr" }).primaryKey(),
    membro_id: model.text().nullable(),
    acao: model.text(),
    alvo_id: model.text().nullable(),
    detalhe: model.json().nullable(),
  })
  .indexes([{ on: ["membro_id"] }, { on: ["alvo_id"] }])
