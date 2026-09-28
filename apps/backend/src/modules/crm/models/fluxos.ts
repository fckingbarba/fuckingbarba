import { model } from "@medusajs/framework/utils"

/**
 * O QUE O MOTOR DOS FLUXOS DECIDIU (`lib/crm/fluxos.ts`) — uma linha por
 * toque de um fluxo pra uma entrada (o pedido do Pix, o carrinho do
 * checkout): mandou, pulou (a rotina parou e o toque passou) ou guardou pro
 * grupo de controle. Único por fluxo, chave e toque: duas rodadas juntas não
 * mandam o mesmo e-mail duas vezes.
 *
 * `cupom` e `cupom_ate`: o código do desconto que este toque deu, e até
 * quando ele vale — é por eles que o motor sabe o "um cupom a cada 60 dias".
 *
 * Uma linha não é e-mail: a escolha do "Barba ou cabelo?" das boas-vindas
 * (entrega 0178), o toque `boas-vindas-escolha`, com a trilha no `como`.
 */
export const EnvioDoFluxo = model
  .define("crm_envio", {
    id: model.id({ prefix: "env" }).primaryKey(),
    email: model.text(),
    fluxo: model.text(),
    chave: model.text(),
    toque: model.text(),
    como: model.text(),
    em: model.dateTime(),
    cupom: model.text().nullable(),
    cupom_ate: model.dateTime().nullable(),
    resend_id: model.text().nullable(),
  })
  .indexes([{ on: ["fluxo", "chave", "toque"], unique: true }, { on: ["email"] }, { on: ["em"] }])

/**
 * QUEM SAIU DA LISTA — o "Sair da lista" de qualquer e-mail do CRM. Os fluxos
 * de compra vão pra quem digitou o e-mail no checkout, sem ter aceitado
 * ofertas; pra essas pessoas, esta é a única marca de que pediram pra parar.
 * Uma linha por e-mail, com a hora da última vez.
 *
 * Um "sim" novo depois dela (a newsletter, a caixa da conta) vale mais: é a
 * pessoa voltando pra lista por conta própria.
 */
export const SaiuDaLista = model
  .define("crm_saiu", {
    id: model.id({ prefix: "sai" }).primaryKey(),
    email: model.text(),
    em: model.dateTime(),
  })
  .indexes([{ on: ["email"], unique: true }])
