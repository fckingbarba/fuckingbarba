import { model } from "@medusajs/framework/utils"

/**
 * UM VALOR QUE VALE A PARTIR DE UM DIA — o custo de um produto, a embalagem
 * de cada pedido e a alíquota do Simples de cada mês. Mudou o custo? Entra
 * uma linha nova com o dia de agora, e as vendas de antes seguem com o custo
 * de antes: o DRE de agosto não muda porque o fornecedor subiu o preço em
 * outubro (`vigente`, em `lib/financeiro/regras.ts`).
 *
 * A `chave`: "custo:<id do produto>", "embalagem" ou "simples". O `valor`:
 * centavos no custo e na embalagem; centésimos de ponto no Simples (6,54% =
 * 654). No Simples, o `desde` é sempre o dia 1 do mês da alíquota.
 */
export const Valor = model
  .define("fin_valor", {
    id: model.id({ prefix: "fval" }).primaryKey(),
    chave: model.text(),
    /** O dia a partir do qual vale, em Brasília ("2026-02-01"). */
    desde: model.text(),
    valor: model.number(),
  })
  .indexes([{ on: ["chave", "desde"], unique: true, where: "deleted_at IS NULL" }])
