import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { podeAbrir } from "../../../../lib/equipe/regras"
import {
  enviosDos,
  feitosNoPedido,
  lerContexto,
  notasDos,
  pedidoPorId,
} from "../../../../lib/painel/ler"
import { detalheDo } from "../../../../lib/painel/pedido"

/**
 * GET /dashboard/pedidos/:id — o pedido inteiro: onde está, o caminho, o
 * histórico (com o que a equipe fez pelo painel, e quem), os itens, o
 * pagamento, a nota, a entrega, o cliente e os botões que o papel pode
 * apertar. Dono e operação; o CPF inteiro e o "Tentar o estorno de novo" só
 * vão pro dono (`lib/painel/pedido.ts`).
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

  const papel = pedido.membro.papel
  const ctx = await lerContexto(req.scope)
  const [notas, envios, feitos] = await Promise.all([
    notasDos(req.scope, [id]),
    enviosDos(req.scope, [id]),
    feitosNoPedido(req.scope, id),
  ])
  res.json({
    pedido: detalheDo(
      o,
      notas.get(id) ?? null,
      envios.get(id) ?? [],
      ctx,
      {
        verCpf: papel === "dono",
        nota: podeAbrir(papel, "pedidos"),
        estorno: podeAbrir(papel, "estornos"),
      },
      feitos
    ),
  })
}
