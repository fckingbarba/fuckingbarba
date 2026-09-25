import { model } from "@medusajs/framework/utils"

/**
 * O QUE ACONTECEU NO NAVEGADOR, SOMADO POR DIA — a página que não existe e
 * o erro que estourou na tela de alguém (`lib/observabilidade/telemetria.ts`).
 * Uma linha por coisa e por dia (no fuso da loja), com as vezes; o vigia
 * transforma o dia em problema (`problemasDasOcorrencias`).
 */
export const Ocorrencia = model
  .define("obs_ocorrencia", {
    id: model.id({ prefix: "oco" }).primaryKey(),
    /** "404" ou "erro". */
    tipo: model.text(),
    /** A página (404) ou "mensagem @ página" (erro): o que soma. */
    chave: model.text(),
    /** "2026-09-25", no fuso da loja. */
    dia: model.text(),
    pagina: model.text(),
    /** A mensagem do erro; no 404, o domínio de onde a pessoa veio da última vez. */
    detalhe: model.text().nullable(),
    vezes: model.number().default(0),
    /** 404 vindos de um link da própria loja: link quebrado nosso. */
    internas: model.number().default(0),
    primeira_em: model.dateTime(),
    ultima_em: model.dateTime(),
  })
  .indexes([{ on: ["tipo", "chave", "dia"], unique: true }, { on: ["dia"] }])
