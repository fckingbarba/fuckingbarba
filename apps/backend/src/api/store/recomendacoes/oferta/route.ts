import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { daLoja } from "../../../../lib/quem-pede"
import { registrarOfertaWorkflow } from "../../../../workflows/recomendacao/registrar-oferta"

/**
 * POST /store/recomendacoes/oferta — `{ pedido, produto, aceito }`: o que a
 * oferta do checkout mostrou nesse pedido, e se a pessoa marcou.
 *
 * Quem chama é a loja, depois de fechar o pedido e depois da resposta
 * (`after()` na ação de finalizar): a tela de obrigado não espera por isto,
 * e uma falha aqui não é falha da compra — só um pedido a menos na conta.
 *
 * SÓ A LOJA (`x-loja-segredo`): de fora, qualquer um poderia inventar
 * aceites e ensinar o motor a oferecer o que quisesse.
 *
 * GRAVA UMA VEZ. Pedido que já tem o registro fica com ele: um segundo
 * aviso (a ação de finalizar rodando de novo, um clique duplo) não
 * transforma "aceitou" em "recusou".
 *
 * RESPOSTAS: 200 `{ gravado }`; 400 `dados_invalidos`; 401 sem assinatura;
 * 404 `pedido_nao_existe`.
 */

const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PEDIDO = /^order_[A-Za-z0-9]+$/

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }

  const corpo = (req.body ?? {}) as { pedido?: unknown; produto?: unknown; aceito?: unknown }
  const pedido = typeof corpo.pedido === "string" && PEDIDO.test(corpo.pedido) ? corpo.pedido : ""
  const produto =
    typeof corpo.produto === "string" && HANDLE.test(corpo.produto) ? corpo.produto : ""
  if (!pedido || !produto || typeof corpo.aceito !== "boolean") {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id"], filters: { id: pedido } })
  if (!data[0]) {
    res.status(404).json({ message: "pedido_nao_existe" })
    return
  }

  // "Já tem oferta?" é pergunta do workflow, dentro da trava do metadata.
  const { result } = await registrarOfertaWorkflow(req.scope).run({
    input: {
      pedidoId: pedido,
      oferta: { produto, aceito: corpo.aceito, em: new Date().toISOString() },
    },
  })
  res.json({ gravado: result.gravada })
}
