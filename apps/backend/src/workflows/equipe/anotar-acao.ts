import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { registrarNaEquipeStep, type Anotacao } from "./registrar"

/**
 * O QUE ALGUÉM DA EQUIPE FEZ PELO PAINEL — "Emitir a nota agora", "Tentar o
 * estorno de novo", uma seção da página do produto salva —, no registro:
 * quem, quando e no que deu.
 *
 * A ação em si já aconteceu quando isto roda: ela tem as travas dela
 * (`lib/erp/notas.ts`, `lib/estornos.ts`, `lib/painel/gravar-produto.ts`) e
 * não é desfeita se a linha não gravar. Por isso também não passa pela
 * trava da equipe — é uma linha a mais, que ninguém lê pra decidir nada. O
 * histórico do pedido e o do produto mostram.
 */
export const anotarAcaoWorkflow = createWorkflow("anotar-acao", (anotacao: Anotacao) => {
  const id = registrarNaEquipeStep(anotacao)
  return new WorkflowResponse(id)
})
