import { model } from "@medusajs/framework/utils"

/**
 * UMA MENSAGEM DO WHATSAPP — a que chegou do cliente e a que a loja mandou.
 *
 * `wamid` é o id da Meta: na que chega, é o que impede a mesma mensagem de
 * entrar duas vezes (a Meta manda o aviso de novo quando a resposta demora);
 * na que sai, é por ele que o aviso de "entregue", "lida" ou "falhou" acha a
 * linha.
 *
 * `autor`: `cliente`, `bot` (o atendente da loja) ou `equipe` (uma pessoa,
 * pelo painel). `tipo`: `texto`, `botao` (a resposta de um botão), `imagem`,
 * `audio`, `video`, `documento`, `figurinha`, `localizacao`, `contato` ou
 * `outro` — o atendente lê o texto e, no resto, sabe o que chegou.
 *
 * `dados`: o que ajuda a entender a resposta do atendente (as ferramentas que
 * ele usou, os tokens) e o erro da Meta, na que não saiu. Nunca o token nem o
 * segredo de ninguém.
 */
export const Mensagem = model
  .define("whatsapp_mensagem", {
    id: model.id({ prefix: "wmsg" }).primaryKey(),
    conversa_id: model.text(),
    wamid: model.text().nullable(),
    direcao: model.enum(["entrada", "saida"]),
    autor: model.enum(["cliente", "bot", "equipe"]),
    tipo: model.text().default("texto"),
    texto: model.text().nullable(),
    /** Na que sai: `enviada`, `entregue`, `lida` ou `falhou`. Na que chega, `null`. */
    situacao: model.text().nullable(),
    erro: model.text().nullable(),
    dados: model.json().nullable(),
    /** Na que chega, a hora da Meta; na que sai, a hora do envio. */
    em: model.dateTime(),
  })
  .indexes([
    { on: ["wamid"], unique: true, where: "deleted_at IS NULL AND wamid IS NOT NULL" },
    { on: ["conversa_id", "em"], where: "deleted_at IS NULL" },
  ])
