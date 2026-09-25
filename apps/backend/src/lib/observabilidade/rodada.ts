import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { semDadoPessoal } from "./sinal"

/**
 * A RODADA DE UMA ROTINA — todo job de `src/jobs` passa por aqui:
 *
 *   export default comRodada(config.name, confirmarPedidos)
 *
 * Anota o começo e o fim na linha da rotina (`obs_rotina`): quando rodou,
 * quanto levou, e o erro, se lançou. O erro segue pro Medusa como antes (ele
 * põe no log); a tabela é só pra tela de Observabilidade.
 *
 * ANOTAR NUNCA DERRUBA O JOB: com a tabela fora (o banco no meio de uma
 * migração, o módulo desligado), a rotina roda do mesmo jeito, e o log diz
 * que a anotação não foi.
 */
export function comRodada(
  nome: string,
  fazer: (container: MedusaContainer) => Promise<unknown>
): (container: MedusaContainer) => Promise<void> {
  return async (container) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    let obs: ObservabilidadeService | null = null
    try {
      obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
    } catch {
      obs = null
    }
    const anotar = (feito: Promise<unknown> | undefined) =>
      feito?.catch((e) =>
        logger.warn(`[rotina] ${nome}: não consegui anotar a rodada — ${mensagem(e)}`)
      )

    const inicio = new Date()
    await anotar(obs?.comecarRodada(nome, inicio))
    try {
      await fazer(container)
    } catch (e) {
      await anotar(
        obs?.terminarRodada(nome, { inicio, fim: new Date(), erro: semDadoPessoal(mensagem(e)) })
      )
      throw e
    }
    await anotar(obs?.terminarRodada(nome, { inicio, fim: new Date(), erro: null }))
  }
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "sem mensagem"
