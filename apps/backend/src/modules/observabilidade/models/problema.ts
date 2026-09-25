import { model } from "@medusajs/framework/utils"

/**
 * UM PROBLEMA DA LOJA — o que o vigia achou (`lib/observabilidade/vigia.ts`),
 * em frase, com o que fazer.
 *
 * A `chave` diz se é o mesmo de antes ("estorno/order_…/pay_…",
 * "frete/2026-09-25"). `sozinho`: é um estado da loja, e sai sozinho quando o
 * estado muda (`resolvido_por` = "sozinha"); senão, é de evento, e alguém
 * marca como visto (`resolvido_por` = o id do membro da equipe).
 * `so_dono`: dinheiro de cliente, como o estorno — só o dono vê.
 */
export const Problema = model
  .define("obs_problema", {
    id: model.id({ prefix: "prob" }).primaryKey(),
    chave: model.text().unique(),
    nivel: model.enum(["grave", "atencao", "info"]),
    area: model.text(),
    titulo: model.text(),
    texto: model.text(),
    /** `{ texto, href, externo? }`: o botão do cartão. */
    acao: model.json().nullable(),
    /** A linha técnica, sem dado de cliente. */
    detalhe: model.text().nullable(),
    pedido_id: model.text().nullable(),
    vezes: model.number().default(1),
    primeira_em: model.dateTime(),
    ultima_em: model.dateTime(),
    situacao: model.enum(["aberto", "resolvido"]).default("aberto"),
    sozinho: model.boolean().default(true),
    so_dono: model.boolean().default(false),
    resolvido_em: model.dateTime().nullable(),
    resolvido_por: model.text().nullable(),
    resolvido_nome: model.text().nullable(),
  })
  .indexes([{ on: ["situacao"] }, { on: ["resolvido_em"] }])
