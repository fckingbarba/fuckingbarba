import { model } from "@medusajs/framework/utils"

/**
 * A CONEXÃO COM UM ERP — uma linha por ERP (hoje, o Bling).
 *
 * Guarda o que a autorização devolveu, CIFRADO (`lib/erp/cofre.ts`): quem
 * ler o banco sem as variáveis do Railway não consegue usar o ERP. E guarda
 * o que o admin precisa ver: com que empresa está ligado, desde quando, se
 * a conexão caiu, e como foi a última sincronização de estoque.
 */
export const Conexao = model
  .define("erp_conexao", {
    id: model.id({ prefix: "erpc" }).primaryKey(),
    /** O id do ERP na loja: "bling". */
    erp: model.text(),
    /** A empresa conectada, como o ERP chama — pra tela do admin. */
    empresa: model.text().nullable(),
    /** Os tokens da autorização, cifrados. `null` = nunca conectou, ou desconectou. */
    credenciais: model.text().nullable(),
    conectado_em: model.dateTime().nullable(),
    /**
     * A partir de quando as notas saem sozinhas: a PRIMEIRA conexão, e não
     * muda mais. O pedido pago antes disso pode já ter nota feita à mão.
     */
    notas_desde: model.dateTime().nullable(),
    /**
     * Quantos minutos a nota espera depois do pagamento — a janela de
     * cancelamento: o pedido vai pro ERP na hora, e o cancelado dentro dela
     * não chega a ter nota. `null` = o padrão (5 minutos); 0 = na hora.
     */
    janela_da_nota: model.number().nullable(),
    /** O "state" da autorização em andamento — de uso único. */
    estado: model.text().nullable(),
    estado_em: model.dateTime().nullable(),
    /** Por que a conexão caiu (a renovação recusada), até alguém conectar de novo. */
    queda: model.text().nullable(),
    queda_avisada_em: model.dateTime().nullable(),
    /** O relatório da última sincronização de estoque (`lib/erp/estoque.ts`). */
    estoque: model.json().nullable(),
  })
  .indexes([{ on: ["erp"], unique: true, where: "deleted_at IS NULL" }])
