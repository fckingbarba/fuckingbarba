import { Module } from "@medusajs/framework/utils"
import ObservabilidadeService from "./service"

/**
 * A SAÚDE DA LOJA — o que hoje só ia pro log, guardado pra tela de
 * Observabilidade do painel (ver o AGENTS.md, "Observabilidade"):
 *
 *   - `obs_rotina`: a última rodada de cada job de `src/jobs`;
 *   - `obs_problema`: os problemas, abertos e resolvidos, com quem resolveu;
 *   - `obs_sinal`: o dia de cada integração (Resend, Frenet, Pagar.me, Bling,
 *     Google, a loja) — quantas vezes deu certo, quantas falhou, e a última.
 *
 * Quem escreve é o código de fora: `lib/observabilidade/` (a rodada, o
 * sinal e o vigia). A regra do que é problema mora em
 * `lib/painel/observabilidade.ts`.
 */
export const OBSERVABILIDADE = "observabilidade"

export default Module(OBSERVABILIDADE, { service: ObservabilidadeService })
