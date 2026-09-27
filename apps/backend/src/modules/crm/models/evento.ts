import { model } from "@medusajs/framework/utils"

/**
 * UMA COISA QUE UM VISITANTE FEZ NA LOJA — viu um produto, pôs na sacola,
 * escolheu o Pix (os tipos de `lib/crm/eventos.ts`).
 *
 * O `email` é o do visitante na hora; quando ele se identifica, as anotações
 * de antes, ainda sem e-mail, ganham o dele. As de um e-mail anterior (o
 * computador de casa, com outra pessoa) ficam com o anterior.
 *
 * `em` é a hora do servidor, menos o "há quanto tempo" que o navegador
 * mandou — o relógio do navegador não conta. O `carrinho_id` é o carrinho
 * do Medusa daquele momento: é por ele que o pedido, depois, se liga ao
 * caminho de quem comprou.
 */
export const Evento = model
  .define("crm_evento", {
    id: model.id({ prefix: "evt" }).primaryKey(),
    visitante_id: model.text(),
    email: model.text().nullable(),
    tipo: model.text(),
    dados: model.json().nullable(),
    /** A página, sem o que identifica alguém ("/produtos/oleo-para-barba"). */
    pagina: model.text(),
    carrinho_id: model.text().nullable(),
    em: model.dateTime(),
  })
  .indexes([{ on: ["visitante_id", "em"] }, { on: ["email", "em"] }, { on: ["em"] }])
