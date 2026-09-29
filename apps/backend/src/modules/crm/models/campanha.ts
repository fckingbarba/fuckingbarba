import { model } from "@medusajs/framework/utils"

/**
 * UMA CAMPANHA DO CRM (entrega 0206, `lib/crm/campanhas.ts`) — o e-mail de
 * data que a equipe escreve, o público e a hora. Quem recebeu (e qual
 * assunto, e quem ficou no controle) mora no registro dos envios
 * (`crm_envio`, o fluxo `campanha`, a chave `<campanha>|<e-mail>`).
 *
 * A situação: rascunho → agendada (com a `agenda`) → enviando (a rotina
 * começou: `comecou_em`) → enviada (`acabou_em`). "parada": alguém parou no
 * meio do envio. Só o rascunho e a agendada se mudam.
 */
export const Campanha = model
  .define("crm_campanha", {
    id: model.id({ prefix: "cmp" }).primaryKey(),
    nome: model.text(),
    assunto: model.text(),
    assunto_b: model.text().nullable(),
    previa: model.text(),
    titulo: model.text(),
    texto: model.text(),
    botao_texto: model.text().nullable(),
    botao_caminho: model.text().nullable(),
    /** Os endereços dos produtos (até 3). */
    produtos: model.json(),
    /** todos, clientes, leads ou em-risco. */
    publico: model.text(),
    situacao: model.text(),
    agenda: model.dateTime().nullable(),
    comecou_em: model.dateTime().nullable(),
    acabou_em: model.dateTime().nullable(),
    /** O e-mail de quem mexeu por último (a equipe). */
    por: model.text().nullable(),
    /**
     * O resultado, guardado quando fecha (7 dias depois do fim do envio,
     * `resultadoFechou`): daí em diante a tela não relê o registro dela.
     */
    resultado: model.json().nullable(),
  })
  .indexes([{ on: ["situacao"] }])
