import { model } from "@medusajs/framework/utils"

/**
 * UM NAVEGADOR QUE DISSE SIM AOS COOKIES — e, do dia em que deixou o
 * e-mail, de quem ele é (`lib/crm/eventos.ts`).
 *
 * A `chave` é o cookie `fb_visitante` da loja, embaralhado
 * (`chaveDoVisitante`): o banco não guarda o valor do cookie. A mesma pessoa
 * no celular e no computador são dois visitantes com o mesmo e-mail — a
 * pessoa é o e-mail.
 *
 * `como` diz de onde veio o e-mail: da conta (o código do e-mail provou), do
 * checkout ou da newsletter. O da conta vale mais: e-mail digitado depois,
 * no checkout ou na newsletter, não troca o que a conta provou.
 *
 * A limpeza (`jobs/crm-limpar.ts`) apaga o visitante 13 meses depois da
 * última vez que ele apareceu.
 */
export const Visitante = model
  .define("crm_visitante", {
    id: model.id({ prefix: "vis" }).primaryKey(),
    chave: model.text(),
    email: model.text().nullable(),
    cliente_id: model.text().nullable(),
    como: model.enum(["conta", "checkout", "newsletter"]).nullable(),
    identificado_em: model.dateTime().nullable(),
    /** De onde chegou da primeira vez (`Origem`): a campanha do link e o domínio que mandou. */
    origem: model.json().nullable(),
    primeira_em: model.dateTime(),
    ultima_em: model.dateTime(),
  })
  .indexes([{ on: ["chave"], unique: true }, { on: ["email"] }, { on: ["ultima_em"] }])
