import { model } from "@medusajs/framework/utils"

/**
 * UMA AVALIAÇÃO — a nota e o texto que quem comprou deu a um produto do
 * pedido, na página escondida `/avaliar` da loja (pelo link do e-mail "o que
 * você achou?", um dia depois da entrega, ou com o número do pedido e o
 * e-mail da compra — `lib/avaliacoes/`).
 *
 * O PEDIDO É DE UMA DAS DUAS LOJAS: `order_…` (a nova, no Medusa) ou `nso_…`
 * (a linha da base da Nuvemshop que o CRM guardou), com o número de lá.
 *
 * UMA POR PRODUTO DE CADA PEDIDO (o índice único): quem comprou o Fator duas
 * vezes avalia duas vezes, uma por compra; o mesmo pedido não vale duas
 * notas pro mesmo produto.
 *
 * SÓ O QUE A PESSOA ESCREVEU, E O PEDIDO: o nome é o que ela digitou (a
 * página sugere "Rafael S."), o texto vai como veio — é depoimento, e
 * depoimento retocado vira anúncio com o nome de outra pessoa. Nada de
 * e-mail ou telefone: quem é a pessoa, o pedido diz.
 *
 * A SITUAÇÃO: `nova` (esperando o painel), `aprovada` (no site) ou
 * `recusada`. Só a aprovada sai em `GET /store/avaliacoes`. Quem aprovou ou
 * recusou fica em `moderada_por` (o membro da equipe) e no registro da
 * equipe.
 */
export const Avaliacao = model
  .define("avaliacao", {
    id: model.id({ prefix: "aval" }).primaryKey(),
    pedido_id: model.text(),
    /** O número do pedido (`display_id`), pro painel. */
    numero: model.number(),
    produto_id: model.text(),
    /** O nome do produto na hora: o painel mostra mesmo se ele sair do catálogo. */
    produto_nome: model.text(),
    /** Como a pessoa quer aparecer no site ("Rafael S."). */
    nome: model.text(),
    /** De 1 a 5. */
    nota: model.number(),
    texto: model.text(),
    situacao: model.enum(["nova", "aprovada", "recusada"]).default("nova"),
    moderada_em: model.dateTime().nullable(),
    /** O id do membro da equipe que aprovou ou recusou. */
    moderada_por: model.text().nullable(),
  })
  .indexes([
    { on: ["pedido_id", "produto_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["situacao"], where: "deleted_at IS NULL" },
    { on: ["produto_id"], where: "deleted_at IS NULL" },
  ])
