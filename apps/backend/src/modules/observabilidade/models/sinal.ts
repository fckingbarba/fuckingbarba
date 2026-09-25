import { model } from "@medusajs/framework/utils"

/**
 * O DIA DE UMA INTEGRAÇÃO — quantas vezes a loja falou com ela e deu certo,
 * quantas falhou, e a última falha. Uma linha por integração e por dia (no
 * fuso da loja), somada na hora (`anotarSinal`, no serviço).
 */
export const Sinal = model
  .define("obs_sinal", {
    id: model.id({ prefix: "sin" }).primaryKey(),
    /** "resend", "frenet", "pagarme", "pagarme-aviso", "bling", "ga4", "loja". */
    integracao: model.text(),
    /** "2026-09-25", no fuso da loja. */
    dia: model.text(),
    ok: model.number().default(0),
    falhas: model.number().default(0),
    ultimo_ok_em: model.dateTime().nullable(),
    primeira_falha_em: model.dateTime().nullable(),
    ultima_falha_em: model.dateTime().nullable(),
    /** A linha técnica da última falha, sem dado de cliente. */
    ultima_falha: model.text().nullable(),
    /** A última falha em frase (no e-mail: o assunto e o endereço mascarado). */
    ultima_falha_resumo: model.text().nullable(),
  })
  .indexes([{ on: ["integracao", "dia"], unique: true }])
