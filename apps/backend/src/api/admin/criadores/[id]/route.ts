import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { apagarInscricao, decidirInscricao } from "../../../../lib/criadores/decidir"

/**
 * POST /admin/criadores/:id — `{ acao: "aprovar" | "recusar" | "apagar" }`,
 * pelo admin do Medusa (a reserva do dono, e o conferidor da loja, que
 * recusa e apaga no fim as inscrições que fez). O mesmo `decidirInscricao` e
 * `apagarInscricao` do painel, sem membro da equipe (`decidida_por` vazio).
 *
 * RESPOSTAS: 200 `{ ok, situacao }` (`situacao: null` depois de apagar); 400
 * `acao`; 404 `nao_encontrada`; 409 `nao_recusada` (apagar só a recusada).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const acao = (req.body as { acao?: unknown } | undefined)?.acao
  if (acao !== "aprovar" && acao !== "recusar" && acao !== "apagar") {
    res.status(400).json({ message: "acao" })
    return
  }
  if (acao === "apagar") {
    const apagada = await apagarInscricao(req.scope, req.params.id)
    if (!apagada.ok) {
      res.status(apagada.motivo === "nao_encontrada" ? 404 : 409).json({ message: apagada.motivo })
      return
    }
    res.json({ ok: true, situacao: null })
    return
  }
  const r = await decidirInscricao(req.scope, req.params.id, acao, null)
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  res.json({ ok: true, situacao: r.situacao })
}
