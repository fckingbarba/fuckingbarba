import { model } from "@medusajs/framework/utils"

/**
 * UMA TENTATIVA DE PAGAR COM CARTÃO — cada uma que ia pro Pagar.me, anotada
 * pela porta do `complete` (`lib/cartao/porta.ts`) antes de ir, e fechada
 * com o que aconteceu. É dela que saem as travas contra o robô testando
 * cartão (`lib/cartao/robo.ts`) e o bloco "Cartão" da Observabilidade.
 *
 * Nada de quem comprou: a sacola (o id do carrinho), a sessão de pagamento,
 * o valor, e QUEM sem o IP — um resumo dele com o segredo da loja, que serve
 * pra contar "a mesma pessoa" e não volta a ser o IP. O vigia apaga o que
 * passou de 30 dias.
 */
export const Tentativa = model
  .define("obs_tentativa", {
    id: model.id({ prefix: "tnt" }).primaryKey(),
    carrinho: model.text(),
    /** `payses_…` — nula na marca de soltura. */
    sessao: model.text().nullable(),
    /** "loja:<resumo do IP>" (assinada pela loja), "direto:<resumo>" ou "admin:<id>" (soltura). */
    quem: model.text(),
    /** Veio pela loja, com o `x-loja-segredo`. */
    assinada: model.boolean().default(false),
    /** `Resultado`, em `lib/cartao/robo.ts`. */
    resultado: model.text(),
    /** A recusa ("banco", "antifraude", "dados"), a trava que barrou, ou o erro. */
    motivo: model.text().nullable(),
    /** Centavos. */
    valor: model.number().nullable(),
  })
  .indexes([{ on: ["created_at"] }, { on: ["carrinho"] }, { on: ["quem"] }])
