import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CHAVE_DO_RASTRO, lerRastro, type Rastro } from "../../lib/anuncios/rastro"
import { gravarNoMetadataDoPedido } from "../../lib/metadata-do-pedido"

/**
 * REGISTRAR O RASTRO DA COMPRA NO PEDIDO — `metadata.fb_rastro` (ver
 * `lib/anuncios/rastro.ts`).
 *
 * Em workflow, como toda escrita que vem de rota. Pela porta do metadata do
 * pedido, só a chave `fb_rastro`, e UMA VEZ: o primeiro que chega fica — a
 * ação de finalizar rodando de novo não troca a resposta sobre os cookies
 * que valeu na hora da compra.
 */

type Entrada = { pedidoId: string; rastro: Rastro }

const gravarRastroNoPedidoStep = createStep(
  "gravar-rastro-no-pedido",
  async ({ pedidoId, rastro }: Entrada, { container }) => {
    const gravado = await gravarNoMetadataDoPedido(container, pedidoId, CHAVE_DO_RASTRO, (atual) =>
      lerRastro(atual) ? undefined : rastro
    )
    return new StepResponse({ gravado }, gravado ? pedidoId : null)
  },
  async (pedidoId, { container }) => {
    if (!pedidoId) return
    await gravarNoMetadataDoPedido(container, pedidoId, CHAVE_DO_RASTRO, null)
  }
)

export const registrarRastroWorkflow = createWorkflow(
  "registrar-rastro",
  (entrada: Entrada) => new WorkflowResponse(gravarRastroNoPedidoStep(entrada))
)
