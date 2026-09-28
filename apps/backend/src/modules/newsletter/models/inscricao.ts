import { model } from "@medusajs/framework/utils"

/**
 * Uma inscrição na newsletter: a do rodapé ou a do pop-up da 1ª compra.
 *
 * Do rodapé, SÓ O E-MAIL, que é o que a Política de Privacidade promete ("Se
 * você assinar a newsletter: só o e-mail"). Do pop-up (entrega 0177), também
 * o nome e a página em que a pessoa se cadastrou — o "Oi, Rafael!" dos
 * e-mails e o que ela estava vendo, pros e-mails falarem do que interessa;
 * a política diz isso também. A data do consentimento e a origem ficam
 * porque são a prova de que a pessoa pediu — na LGPD (art. 8º, § 2º),
 * provar o consentimento é obrigação de quem guarda o dado.
 *
 * Sem "cancelado": quem pede pra sair é APAGADO (admin → Newsletter →
 * Remover). É o que a política diz ("fica até você pedir pra sair"), e um
 * e-mail guardado com marca de cancelado continua sendo um dado guardado.
 */
export const Inscricao = model.define("newsletter_inscricao", {
  id: model.id({ prefix: "news" }).primaryKey(),
  email: model.text().unique(),
  /** Onde a pessoa se inscreveu: "rodape" ou "popup". */
  origem: model.text().nullable(),
  /** O nome que a pessoa deu no pop-up. */
  nome: model.text().nullable(),
  /** A página em que ela se cadastrou no pop-up ("/produtos/oleo-para-barba"). */
  pagina: model.text().nullable(),
  consentido_em: model.dateTime(),
})
