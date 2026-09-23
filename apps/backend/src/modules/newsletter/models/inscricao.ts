import { model } from "@medusajs/framework/utils"

/**
 * Uma inscrição na newsletter do rodapé.
 *
 * SÓ O E-MAIL, que é o que a Política de Privacidade promete ("Se você
 * assinar a newsletter: só o e-mail"). A data do consentimento e a origem
 * ficam porque são a prova de que a pessoa pediu — na LGPD (art. 8º, § 2º),
 * provar o consentimento é obrigação de quem guarda o dado.
 *
 * Sem "cancelado": quem pede pra sair é APAGADO (admin → Newsletter →
 * Remover). É o que a política diz ("fica até você pedir pra sair"), e um
 * e-mail guardado com marca de cancelado continua sendo um dado guardado.
 */
export const Inscricao = model.define("newsletter_inscricao", {
  id: model.id({ prefix: "news" }).primaryKey(),
  email: model.text().unique(),
  /** Onde a pessoa se inscreveu: "rodape", por enquanto. */
  origem: model.text().nullable(),
  consentido_em: model.dateTime(),
})
