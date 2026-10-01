import { model } from "@medusajs/framework/utils"

/**
 * UMA CONVERSA DO WHATSAPP — uma por número de quem escreveu pra loja.
 *
 * Nasce na primeira mensagem que chega (`POST /hooks/whatsapp`) e junta tudo
 * o que aquele número mandou e recebeu (`whatsapp_mensagem`). O atendente
 * (`lib/whatsapp/`) responde de minuto em minuto, pelo job
 * `responder-no-whatsapp`.
 *
 * QUEM ESTÁ RESPONDENDO (`situacao`): `bot` — o atendente da loja; `equipe` —
 * o atendente passou a conversa pra uma pessoa (pediu humano, reclamação,
 * troca), e fica quieto até `equipe_desde` + `VOLTA_PRO_BOT_EM_H`
 * (`lib/whatsapp/regras.ts`) sem ninguém da equipe responder.
 *
 * A FILA (`pendente_desde`): a hora da primeira mensagem do cliente que ainda
 * não teve resposta. O job pega as conversas com fila e com a última mensagem
 * há pelo menos `ESPERA_S` segundos — quem manda três mensagens seguidas
 * recebe UMA resposta, que leu as três. Respondida, a fila volta a `null`.
 *
 * `ultima_entrada_em` abre a janela de 24 horas da Meta: só dentro dela a
 * loja manda texto livre, de graça. Fora, só modelo aprovado (não usado aqui).
 */
export const Conversa = model
  .define("whatsapp_conversa", {
    id: model.id({ prefix: "wcon" }).primaryKey(),
    /** O número como a Meta manda (`wa_id`): só dígitos, com o 55. "5547999990000". */
    telefone: model.text(),
    /** O nome do perfil do WhatsApp da pessoa, como ela escreveu lá. */
    nome: model.text().nullable(),
    situacao: model.enum(["bot", "equipe"]).default("bot"),
    /** Quando o atendente passou pra equipe, e por quê (na frase dele). */
    equipe_desde: model.dateTime().nullable(),
    equipe_motivo: model.text().nullable(),
    ultima_entrada_em: model.dateTime().nullable(),
    pendente_desde: model.dateTime().nullable(),
    /** Rodadas seguidas em que a resposta não saiu (a IA ou a Meta fora). Zera quando sai. */
    tentativas: model.number().default(0),
  })
  .indexes([
    { on: ["telefone"], unique: true, where: "deleted_at IS NULL" },
    { on: ["pendente_desde"], where: "deleted_at IS NULL AND pendente_desde IS NOT NULL" },
  ])
