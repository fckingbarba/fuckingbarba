import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { gravarNoMetadataDoPedido } from "../../lib/metadata-do-pedido"
import { CHAVE_DA_OFERTA, lerOferta } from "../../lib/recomendacao"

/**
 * REGISTRAR A OFERTA DO CHECKOUT NO PEDIDO — `metadata.fb_bump`.
 *
 * É o que faz a oferta aprender: o modelo (`lib/recomendacao.ts`) conta,
 * produto a produto, quantas vezes ela apareceu e quantas foi aceita.
 *
 * Em workflow, e não direto na rota, porque é assim que o Medusa quer toda
 * escrita (o lint do build avisa). Grava pela porta do metadata do pedido
 * (`lib/metadata-do-pedido.ts`), só a chave `fb_bump`: a loja chama isto
 * logo depois de fechar o pedido, no mesmo instante em que o pagamento
 * grava o registro da confirmação — gravando direto, um apagava o outro (o
 * #467). E UMA VEZ: a pergunta "já tem oferta?" é feita dentro da trava, e
 * dois avisos juntos não transformam "aceitou" em "recusou".
 */

type Entrada = {
  pedidoId: string
  oferta: { produto: string; aceito: boolean; em: string }
}

const gravarOfertaNoPedidoStep = createStep(
  "gravar-oferta-no-pedido",
  async ({ pedidoId, oferta }: Entrada, { container }) => {
    const gravada = await gravarNoMetadataDoPedido(container, pedidoId, CHAVE_DA_OFERTA, (atual) =>
      lerOferta({ [CHAVE_DA_OFERTA]: atual }) ? undefined : oferta
    )
    return new StepResponse({ gravada }, gravada ? pedidoId : null)
  },
  async (pedidoId, { container }) => {
    if (!pedidoId) return
    await gravarNoMetadataDoPedido(container, pedidoId, CHAVE_DA_OFERTA, null)
  }
)

export const registrarOfertaWorkflow = createWorkflow(
  "registrar-oferta",
  (entrada: Entrada) => new WorkflowResponse(gravarOfertaNoPedidoStep(entrada))
)
