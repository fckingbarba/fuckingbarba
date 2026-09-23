import { model } from "@medusajs/framework/utils"

/**
 * A NOTA FISCAL DE UM PEDIDO, no ERP — uma por pedido.
 *
 * É o registro de onde ela está (`situacao`, no vocabulário da loja, nunca
 * no do ERP — ver `lib/erp/contrato.ts`) e dos passos já dados no ERP
 * (`no_erp`: os ids do cliente, do pedido de venda e da nota lá). Os passos
 * são gravados um a um, no momento em que acontecem: se o servidor cair no
 * meio, a próxima tentativa continua de onde parou, em vez de criar um
 * segundo pedido — e uma segunda nota — no ERP.
 *
 * Mora numa tabela, e não no metadata do pedido, porque é procurada pelos
 * lados: pela situação (a varredura das que estão na SEFAZ) e pelo id da
 * nota no ERP (o aviso que o ERP manda).
 */
export const Nota = model
  .define("erp_nota", {
    id: model.id({ prefix: "nota" }).primaryKey(),
    pedido_id: model.text(),
    /** O ERP que emitiu: "bling". */
    erp: model.text(),
    /** Como o pedido se chama lá: "FB-1042". */
    referencia: model.text(),
    /**
     * "a-emitir" (nada no ERP ainda, ou parou no meio), "processando" (na
     * SEFAZ), "autorizada", "rejeitada", "denegada", "cancelada" (no ERP) e
     * "desfeita" (o pedido foi cancelado antes da autorização, e a loja
     * desfez o que tinha feito no ERP).
     */
    situacao: model.text().default("a-emitir"),
    /** Os passos dados no ERP, do jeito que o tradutor dele precisa. */
    no_erp: model.json().nullable(),
    /** O id da nota no ERP — é por ele que o aviso do ERP acha o registro. */
    id_no_erp: model.text().nullable(),
    /** O que o ERP disse da nota: o motivo da rejeição, por exemplo. */
    detalhe: model.text().nullable(),
    numero: model.text().nullable(),
    serie: model.text().nullable(),
    chave: model.text().nullable(),
    /** Em centavos. */
    valor: model.number().nullable(),
    /** Quando foi autorizada (é daí que conta o prazo de cancelamento). */
    emitida_em: model.dateTime().nullable(),
    link_danfe: model.text().nullable(),
    tentativas: model.number().default(0),
    /** Por que a última tentativa não andou. */
    erro: model.text().nullable(),
    /** Tentar de novo não resolve: precisa de alguém. */
    definitivo: model.boolean().default(false),
    /** Antes disso, a varredura não tenta de novo (espera crescente). */
    proxima_em: model.dateTime().nullable(),
    /** O pedido foi cancelado: desfazer no ERP, ou avisar pra cancelar lá. */
    cancelar: model.boolean().default(false),
    /** Os e-mails já mandados à equipe: `{ "cancelar": "…", "problema": "…" }`. */
    avisos: model.json().nullable(),
  })
  .indexes([
    { on: ["pedido_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["erp", "id_no_erp"], where: "id_no_erp IS NOT NULL AND deleted_at IS NULL" },
    { on: ["situacao"], where: "deleted_at IS NULL" },
  ])
