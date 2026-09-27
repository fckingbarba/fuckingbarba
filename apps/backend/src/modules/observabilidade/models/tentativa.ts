import { model } from "@medusajs/framework/utils"

/**
 * UMA TENTATIVA DE PAGAR — cada uma que ia pra um parceiro de pagamento,
 * anotada pela porta do `complete` (`lib/cartao/porta.ts`) antes de ir, e
 * fechada com o que aconteceu. Do CARTÃO saem as travas contra o robô
 * testando cartão (`lib/cartao/robo.ts`) e o bloco "Cartão" da
 * Observabilidade; de todas, o disjuntor dos parceiros
 * (`lib/pagamento/disjuntor.ts`). Até a 0150, só o cartão era anotado.
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
    /**
     * O parceiro (`pp_…`, `lib/pagamento/parceiros.ts`). Nula na marca de soltura e nas de
     * antes da 0150 — todas de cartão no Pagar.me, fora do disjuntor (ver a migração).
     */
    provedor: model.text().nullable(),
    /** "cartao" ou "pix". As de antes da 0150 são todas de cartão. */
    forma: model.text().default("cartao"),
  })
  .indexes([{ on: ["created_at"] }, { on: ["carrinho"] }, { on: ["quem"] }])
