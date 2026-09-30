import { model } from "@medusajs/framework/utils"

/**
 * UMA DESPESA QUE O DONO LANÇA no Financeiro do painel — o anúncio, o
 * sistema, o pró-labore, o contador; e, antes da loja nova, o total de taxas
 * e de frete que a Nuvemshop cobrou no mês. As categorias (e a linha do DRE
 * em que cada uma cai) moram em `lib/financeiro/regras.ts`.
 *
 * O MÊS É O DA COMPETÊNCIA ("2026-09"): a despesa entra no DRE daquele mês,
 * não no dia em que foi paga. A que REPETE entra de `mes` até `ate` (ou até
 * alguém parar, com `ate` vazio). Mudar o valor de uma que repete, num mês
 * depois do primeiro, fecha esta no mês de antes e abre outra dali em
 * diante — os meses de antes ficam como estavam (`lib/financeiro/despesas.ts`).
 */
export const Despesa = model
  .define("fin_despesa", {
    id: model.id({ prefix: "fdes" }).primaryKey(),
    descricao: model.text(),
    /** A categoria (`CATEGORIAS`): "marketing", "plataforma"… */
    categoria: model.text(),
    /** Em centavos. */
    valor: model.number(),
    /** O mês em que entra ("2026-09"); na que repete, o primeiro. */
    mes: model.text(),
    repete: model.boolean().default(false),
    /** Na que repete: o último mês em que entra, ou nada (até parar). */
    ate: model.text().nullable(),
    /** O id do membro da equipe que lançou. */
    lancada_por: model.text().nullable(),
  })
  .indexes([{ on: ["mes"], where: "deleted_at IS NULL" }])
