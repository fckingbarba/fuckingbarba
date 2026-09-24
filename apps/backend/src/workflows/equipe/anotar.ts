import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { registrarNaEquipeStep, type Anotacao } from "./registrar"

/**
 * O QUE ALGUÉM DA EQUIPE FEZ NUM PEDIDO — "Emitir a nota agora", "Tentar o
 * estorno de novo" —, no registro: quem apertou, quando e no que deu.
 *
 * A ação em si já aconteceu quando isto roda: ela tem as travas dela
 * (`lib/erp/notas.ts`, `lib/estornos.ts`) e não é desfeita se a linha não
 * gravar. Por isso também não passa pela trava da equipe — é uma linha a
 * mais, que ninguém lê pra decidir nada. O histórico do pedido mostra.
 */
export const anotarNoPedidoWorkflow = createWorkflow("anotar-no-pedido", (anotacao: Anotacao) => {
  const id = registrarNaEquipeStep(anotacao)
  return new WorkflowResponse(id)
})
