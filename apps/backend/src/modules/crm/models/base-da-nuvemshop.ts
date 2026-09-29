import { model } from "@medusajs/framework/utils"

/**
 * A BASE DA NUVEMSHOP — o que o CRM guarda dos três arquivos que a loja
 * antiga exporta (`lib/crm/nuvemshop.ts`). Só o que o CRM usa: nada de
 * rastreio ou cartão. O CPF, o telefone e o endereço só na `entrega` do
 * pedido, cifrada (entrega 0202, `lib/crm/entrega-da-base.ts`): é o que o
 * "Refazer o pedido" da reposição preenche. Mandar o arquivo de novo
 * atualiza (pelo e-mail, pelo número do pedido, pelo id do carrinho), e
 * ninguém sai.
 */

/** Uma pessoa da loja antiga — pelo e-mail. */
export const PessoaDaBase = model
  .define("crm_base_pessoa", {
    id: model.id({ prefix: "nsp" }).primaryKey(),
    email: model.text(),
    /** O primeiro nome. */
    nome: model.text().nullable(),
    /** O "Aceita" da coluna Marketing: o sim pras ofertas por e-mail. */
    aceita_ofertas: model.boolean().default(false),
    ofertas_em: model.dateTime().nullable(),
    newsletter_em: model.dateTime().nullable(),
    tinha_conta: model.boolean().default(false),
    desde: model.dateTime().nullable(),
  })
  .indexes([{ on: ["email"], unique: true }])

/** Um pedido da loja antiga. Os valores em centavos; os itens pelo SKU. */
export const PedidoDaBase = model
  .define("crm_base_pedido", {
    id: model.id({ prefix: "nso" }).primaryKey(),
    numero: model.text(),
    email: model.text(),
    feito_em: model.dateTime(),
    pago_em: model.dateTime().nullable(),
    enviado_em: model.dateTime().nullable(),
    /** confirmado, recusado, estornado ou outro. */
    pagamento: model.text(),
    /** entregue, enviado, nao-enviado ou outro. */
    envio: model.text(),
    total: model.number(),
    desconto: model.number(),
    frete: model.number(),
    cupom: model.text().nullable(),
    /** pix, cartao, boleto ou combinar. */
    meio: model.text().nullable(),
    /** `[{ sku, nome, quantidade, valor }]`, o valor em reais. */
    itens: model.json(),
    /** O nome, o celular, o CPF e o endereço de entrega, cifrados (`fecharEntrega`). */
    entrega: model.text().nullable(),
  })
  .indexes([{ on: ["numero"], unique: true }, { on: ["email"] }])

/** Um carrinho abandonado na loja antiga. */
export const CarrinhoDaBase = model
  .define("crm_base_carrinho", {
    id: model.id({ prefix: "nsc" }).primaryKey(),
    carrinho: model.text(),
    email: model.text(),
    criado_em: model.dateTime(),
    /** antes-do-pagamento ou pagamento-falhou. */
    tipo: model.text().nullable(),
    total: model.number(),
    itens: model.json(),
  })
  .indexes([{ on: ["carrinho"], unique: true }, { on: ["email"] }])
