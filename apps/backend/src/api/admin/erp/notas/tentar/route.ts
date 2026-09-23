import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { tentarDeNovo } from "../../../../../lib/erp/notas"

/**
 * POST /admin/erp/notas/tentar — `{ pedidoId }`: a nota é emitida agora, sem
 * esperar a janela. É o "Tentar de novo" da tela do ERP (a nota de que a loja
 * tinha desistido, depois que alguém corrigiu o que faltava) e o "Emitir
 * agora" (a nota esperando a janela, do pedido que precisa sair antes).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const pedidoId = (req.body as { pedidoId?: unknown } | undefined)?.pedidoId
  if (typeof pedidoId !== "string" || !/^order_[0-9A-Z]{10,40}$/.test(pedidoId)) {
    res.status(400).json({ message: "pedidoId é o id do pedido (order_…)" })
    return
  }
  res.json({ resultado: await tentarDeNovo(req.scope, pedidoId) })
}
