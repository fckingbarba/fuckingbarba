import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"

/**
 * Guarda a avaliação de um produto do pedido — ou diz que ele já tinha uma.
 *
 * Quem chama é `POST /store/avaliacoes`, com tudo conferido: o link, o
 * pedido (pago, não cancelado), o produto (é do pedido) e os campos
 * (`lerAvaliacao`). Entra como `nova`: o site só mostra depois do painel.
 */

type Entrada = {
  pedidoId: string
  numero: number
  produtoId: string
  produtoNome: string
  nome: string
  nota: number
  texto: string
}

const gravarAvaliacaoStep = createStep(
  "gravar-avaliacao",
  async (e: Entrada, { container }) => {
    const avaliacoes = container.resolve<AvaliacoesService>(AVALIACOES)
    const filtro = { pedido_id: e.pedidoId, produto_id: e.produtoId }
    const [existente] = await avaliacoes.listAvaliacoes(filtro, { take: 1 })
    if (existente) return new StepResponse({ nova: false }, null)

    try {
      const criada = await avaliacoes.createAvaliacoes({
        pedido_id: e.pedidoId,
        numero: e.numero,
        produto_id: e.produtoId,
        produto_nome: e.produtoNome,
        nome: e.nome,
        nota: e.nota,
        texto: e.texto,
      })
      return new StepResponse({ nova: true }, criada.id)
    } catch (erro) {
      // Dois envios juntos (o duplo clique, duas abas): o segundo esbarra no
      // índice único, e a resposta é a mesma de quem já tinha avaliado.
      const [agora] = await avaliacoes.listAvaliacoes(filtro, { take: 1 })
      if (agora) return new StepResponse({ nova: false }, null)
      throw erro
    }
  },
  async (criada, { container }) => {
    if (!criada) return
    await container.resolve<AvaliacoesService>(AVALIACOES).deleteAvaliacoes(criada)
  }
)

export const enviarAvaliacaoWorkflow = createWorkflow(
  "enviar-avaliacao",
  (entrada: Entrada) => new WorkflowResponse(gravarAvaliacaoStep(entrada))
)
