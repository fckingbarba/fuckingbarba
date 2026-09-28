import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { apagarInscricao, decidirInscricao } from "../../../../lib/criadores/decidir"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"

/**
 * POST /dashboard/criadores/:id — `{ acao: "aprovar" | "recusar" | "apagar" }`.
 * Aprovada, a loja vai chamar pra fechar; recusada, não. Apagar é de vez, e
 * só a recusada (a pessoa pediu pra sair, ou não vai ser chamada mesmo —
 * `apagarInscricao`). Fica no registro da equipe só com o modelo: nome e
 * contato de quem pediu pra apagar não ficam guardados em outro lugar.
 *
 * RESPOSTAS: 200 `{ ok, situacao }` (`situacao: null` depois de apagar); 400
 * `acao`; 403 `sem_acesso`; 404 `nao_encontrada`; 409 `nao_recusada`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "criadores")) return
  const acao = (req.body as { acao?: unknown } | undefined)?.acao
  if (acao !== "aprovar" && acao !== "recusar" && acao !== "apagar") {
    res.status(400).json({ message: "acao" })
    return
  }
  const id = req.params.id
  if (acao === "apagar") {
    const apagada = await apagarInscricao(req.scope, id)
    if (!apagada.ok) {
      res.status(apagada.motivo === "nao_encontrada" ? 404 : 409).json({ message: apagada.motivo })
      return
    }
    await anotar(pedido, "apagou-criador", id, { modelo: apagada.modelo })
    res.json({ ok: true, situacao: null })
    return
  }
  const r = await decidirInscricao(req.scope, id, acao, pedido.membro.id)
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  if (r.mudou) {
    await anotar(pedido, acao === "aprovar" ? "aprovou-criador" : "recusou-criador", id, {
      modelo: r.modelo,
    })
  }
  res.json({ ok: true, situacao: r.situacao })
}
