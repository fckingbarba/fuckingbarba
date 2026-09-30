import { model } from "@medusajs/framework/utils"

/**
 * O QUE UM PEDIDO DA LOJA NOVA CUSTOU PRA LOJA e o sistema foi buscar fora:
 * a taxa que o Pagar.me (ou o Mercado Pago) cobrou no pagamento e, quando o
 * pedido não guardou a cotação da Frenet no checkout, o frete cotado depois.
 * Quem preenche é o job `custos-dos-pedidos` (`lib/financeiro/custos-dos-pedidos.ts`);
 * quem lê é o DRE (`lib/financeiro/dre.ts`).
 *
 * UM POR PEDIDO (o índice único). Os valores em centavos; `null` é "ainda
 * não sei" — o job tenta de novo a cada rodada, até `tentativas` chegar no
 * limite, e o DRE avisa quantos pedidos estão sem.
 */
export const CustoDoPedido = model
  .define("fin_pedido", {
    id: model.id({ prefix: "fped" }).primaryKey(),
    /** O id do pedido no Medusa (`order_…`). */
    pedido_id: model.text(),
    /** A taxa do pagamento, em centavos. */
    taxa: model.number().nullable(),
    /** De quem: "pagarme" ou "mercadopago". */
    taxa_de: model.text().nullable(),
    /** O frete cotado depois (o pedido sem a cotação do checkout), em centavos. */
    frete: model.number().nullable(),
    tentativas: model.number().default(0),
    /** A última vez que o job tentou, e por que não deu (frase curta, sem dado de cliente). */
    tentou_em: model.dateTime().nullable(),
    erro: model.text().nullable(),
  })
  .indexes([{ on: ["pedido_id"], unique: true, where: "deleted_at IS NULL" }])
