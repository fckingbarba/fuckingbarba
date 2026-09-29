import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { rodarAsCampanhas } from "../../../../../lib/crm/enviar-campanhas"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"

/**
 * POST /dashboard/crm/campanhas/rodar — roda as campanhas agora, sem esperar
 * a rotina dos 5 minutos (entrega 0206), com a mesma trava dela.
 *
 * `{ agora, email }` só fora de produção: é como o conferidor faz o tempo
 * andar e manda só pra pessoa dele, sem mexer nas dos outros conferidores.
 *
 * Quem abre o CRM. RESPOSTAS: 200 o relatório da rodada; 400 `agora`/`email`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const corpo = (req.body ?? {}) as { agora?: unknown; email?: unknown }
  const producao = process.env.NODE_ENV === "production"
  let agora = new Date()
  if (corpo.agora !== undefined) {
    const d = new Date(String(corpo.agora))
    if (producao || Number.isNaN(d.getTime())) {
      res.status(400).json({ message: "agora" })
      return
    }
    agora = d
  }
  if (corpo.email !== undefined && (producao || typeof corpo.email !== "string")) {
    res.status(400).json({ message: "email" })
    return
  }
  const so = typeof corpo.email === "string" ? corpo.email : null
  const relatorio = await req.scope
    .resolve(Modules.LOCKING)
    .execute("campanhas-do-crm", () => rodarAsCampanhas(req.scope, { agora, so }), {
      timeout: 240,
    })
  res.json(relatorio)
}
