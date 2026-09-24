import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { PedidoDaEquipe } from "../equipe/acesso"
import { anotarAcaoWorkflow } from "../../workflows/equipe/anotar-acao"

/**
 * Uma linha no registro da equipe — quem fez, no quê, e o que foi. A ação já
 * aconteceu: se a linha não gravar, fica um aviso no log, e a resposta segue.
 */
export async function anotar(
  pedido: PedidoDaEquipe,
  acao: string,
  alvo: string,
  detalhe: Record<string, unknown>
): Promise<void> {
  await anotarAcaoWorkflow(pedido.scope)
    .run({ input: { membro_id: pedido.membro.id, acao, alvo_id: alvo, detalhe } })
    .catch((e: unknown) =>
      pedido.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[painel] ${acao} em ${alvo} andou, mas o registro não gravou: ${e}`)
    )
}
