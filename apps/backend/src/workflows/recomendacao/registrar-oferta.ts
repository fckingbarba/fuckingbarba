import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CHAVE_DA_OFERTA } from "../../lib/recomendacao"

/**
 * REGISTRAR A OFERTA DO CHECKOUT NO PEDIDO — `metadata.fb_bump`.
 *
 * É o que faz a oferta aprender: o modelo (`lib/recomendacao.ts`) conta,
 * produto a produto, quantas vezes ela apareceu e quantas foi aceita.
 *
 * Em workflow, e não direto na rota, porque é assim que o Medusa quer toda
 * escrita (o lint do build avisa). O resto do metadata do pedido fica como
 * estava — os registros de e-mail e de estorno moram lá também.
 */

type Entrada = {
  pedidoId: string
  oferta: { produto: string; aceito: boolean; em: string }
}

type Desfazer = { pedidoId: string; antes: Record<string, unknown> | null }

const gravarOfertaNoPedidoStep = createStep(
  "gravar-oferta-no-pedido",
  async ({ pedidoId, oferta }: Entrada, { container }) => {
    const pedidos = container.resolve(Modules.ORDER)
    const pedido = await pedidos.retrieveOrder(pedidoId, { select: ["id", "metadata"] })
    const antes = (pedido.metadata as Record<string, unknown> | null) ?? null
    await pedidos.updateOrders([
      { id: pedidoId, metadata: { ...(antes ?? {}), [CHAVE_DA_OFERTA]: oferta } },
    ])
    return new StepResponse<void, Desfazer>(undefined, { pedidoId, antes })
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    await container.resolve(Modules.ORDER).updateOrders([
      {
        id: desfazer.pedidoId,
        metadata: { ...(desfazer.antes ?? {}), [CHAVE_DA_OFERTA]: null },
      },
    ])
  }
)

export const registrarOfertaWorkflow = createWorkflow("registrar-oferta", (entrada: Entrada) => {
  gravarOfertaNoPedidoStep(entrada)
  return new WorkflowResponse(undefined)
})
