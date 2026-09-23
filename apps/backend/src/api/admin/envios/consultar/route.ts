import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { perguntarAosParceiros } from "../../../../lib/envios/consultas"

/**
 * POST /admin/envios/consultar — a consulta de rastreio agora, sem esperar
 * a hora cheia do worker.
 *
 * Pra quem cuida da loja apertar quando um cliente diz "chegou e a conta
 * diz que não", e pro conferidor de envios provar que a etiqueta do painel
 * (que não manda aviso) anda sozinha. Devolve o relatório — e é
 * idempotente: evento repetido não entra de novo.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const relatorio = await perguntarAosParceiros(req.scope)
  res.json({ relatorio })
}
