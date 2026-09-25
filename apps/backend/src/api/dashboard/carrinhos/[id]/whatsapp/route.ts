import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { CHAMOU_NO_WHATSAPP } from "../../../../../lib/painel/ler-carrinhos"

/**
 * POST /dashboard/carrinhos/:id/whatsapp — anota que alguém da equipe abriu
 * o WhatsApp desse carrinho (o botão da lista). A conversa é no WhatsApp; aqui
 * só fica quem chamou e quando, pra ninguém chamar a mesma pessoa duas vezes.
 * Dono e operação (o marketing não vê o telefone).
 *
 * RESPOSTAS: 200 `{ ok }`; 403 marketing; 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "carrinhos")) return
  if (pedido.membro.papel === "marketing") {
    res.status(403).json({ message: "sem_permissao" })
    return
  }
  const id = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = /^cart_[0-9A-Z]{10,40}$/.test(id)
    ? await query.graph({ entity: "cart", fields: ["id"], filters: { id, completed_at: null } })
    : { data: [] }
  if (!data[0]) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  await anotar(pedido, CHAMOU_NO_WHATSAPP, id, {})
  res.json({ ok: true })
}
