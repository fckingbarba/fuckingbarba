import { model } from "@medusajs/framework/utils"

/**
 * A ÚLTIMA RODADA DE UMA ROTINA — uma linha por job de `src/jobs`, reescrita
 * a cada rodada (`lib/observabilidade/rodada.ts`). Sem histórico: a tela
 * mostra a última vez, e o problema que ela vira (falhando seguido, parada)
 * mora em `obs_problema`.
 */
export const Rotina = model.define("obs_rotina", {
  id: model.id({ prefix: "rot" }).primaryKey(),
  /** O `config.name` do job. */
  nome: model.text().unique(),
  ultima_inicio: model.dateTime().nullable(),
  ultima_fim: model.dateTime().nullable(),
  ultima_duracao_ms: model.number().nullable(),
  /** "rodando", "ok" ou "erro". */
  ultima_situacao: model.text().nullable(),
  /** A mensagem do erro, sem dado de cliente. */
  ultimo_erro: model.text().nullable(),
  ultimo_ok_em: model.dateTime().nullable(),
  falhas_seguidas: model.number().default(0),
})
