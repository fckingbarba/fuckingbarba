import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { pedidoDoLink } from "../../../../lib/avaliacoes/link"
import { lerPedidoParaAvaliar } from "../../../../lib/avaliacoes/pedido"

/**
 * GET /store/avaliacoes/pedido?p=<link> — o que a página `/avaliar` mostra
 * pro pedido do link: o número, a sugestão de nome ("Rafael S.") e os
 * produtos, cada um dizendo se já tem avaliação (`lerPedidoParaAvaliar`).
 * Sem e-mail, sem endereço, sem o id do pedido.
 *
 * RESPOSTAS: 200 `{ pedido: { numero, nome, produtos } }`; 404
 * `link_invalido`; 409 `nao_aceita` (cancelado, sem pagamento).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pedidoId = pedidoDoLink((req.query as { p?: unknown }).p)
  if (!pedidoId) {
    res.status(404).json({ message: "link_invalido" })
    return
  }
  const leitura = await lerPedidoParaAvaliar(req.scope, pedidoId)
  if (!leitura.ok) {
    res
      .status(leitura.motivo === "sem_pedido" ? 404 : 409)
      .json({ message: leitura.motivo === "sem_pedido" ? "link_invalido" : "nao_aceita" })
    return
  }
  const { numero, nome, produtos } = leitura.pedido
  res.json({ pedido: { numero, nome, produtos } })
}
