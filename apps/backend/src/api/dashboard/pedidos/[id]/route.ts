import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { enviosDos, lerContexto, notasDos, pedidoPorId } from "../../../../lib/painel/ler"
import { detalheDo } from "../../../../lib/painel/pedido"

/**
 * GET /dashboard/pedidos/:id — o pedido inteiro: onde está, o caminho, o
 * histórico, os itens, o pagamento, a nota, a entrega e o cliente. Dono e
 * operação; o CPF inteiro só vai pro dono (`lib/painel/pedido.ts`).
 *
 * RESPOSTAS: 200 `{ pedido }`; 404 `nao_encontrado`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const id = req.params.id
  const o = /^order_[0-9A-Z]{10,40}$/.test(id) ? await pedidoPorId(req.scope, id) : null
  if (!o) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }

  const ctx = await lerContexto(req.scope)
  const [notas, envios] = await Promise.all([notasDos(req.scope, [id]), enviosDos(req.scope, [id])])
  res.json({
    pedido: detalheDo(o, notas.get(id) ?? null, envios.get(id) ?? [], ctx, {
      verCpf: pedido.membro.papel === "dono",
    }),
  })
}
