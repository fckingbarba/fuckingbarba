import { model } from "@medusajs/framework/utils"

/**
 * UM E-MAIL QUE A LOJA MANDOU, E O QUE ACONTECEU COM ELE — pelos avisos do
 * Resend (`lib/crm/resend.ts`): chegou, atrasou, foi aberto, levou clique,
 * voltou, virou reclamação de spam. Uma linha por e-mail (o id do Resend);
 * cada aviso preenche a sua hora.
 *
 * As horas de primeira vez (`aberto_em`, `clicado_em`) ficam com a mais
 * antiga, e as de última vez com a mais nova — o aviso repetido, ou fora de
 * ordem, não muda nada. Sem assunto: o do código de entrar tem o código.
 *
 * `equipe`: o e-mail foi pra alguém da equipe do painel (a venda nova, o
 * código do painel) — fica fora das contas do CRM, que são de cliente.
 */
export const EmailDoCrm = model
  .define("crm_email", {
    id: model.id({ prefix: "eml" }).primaryKey(),
    resend_id: model.text(),
    para: model.text().nullable(),
    tipo: model.text().nullable(),
    equipe: model.boolean().default(false),
    enviado_em: model.dateTime().nullable(),
    entregue_em: model.dateTime().nullable(),
    atrasado_em: model.dateTime().nullable(),
    aberto_em: model.dateTime().nullable(),
    ultima_abertura_em: model.dateTime().nullable(),
    clicado_em: model.dateTime().nullable(),
    ultimo_clique_em: model.dateTime().nullable(),
    /** A página da loja do último clique ("/conta/pedidos/:id"), ou o domínio de fora. */
    ultimo_link: model.text().nullable(),
    devolvido_em: model.dateTime().nullable(),
    /** O tipo e o porquê da devolução, sem dado de ninguém. */
    devolucao: model.text().nullable(),
    reclamou_em: model.dateTime().nullable(),
    falhou_em: model.dateTime().nullable(),
    suprimido_em: model.dateTime().nullable(),
  })
  .indexes([{ on: ["resend_id"], unique: true }, { on: ["para"] }, { on: ["enviado_em"] }])
