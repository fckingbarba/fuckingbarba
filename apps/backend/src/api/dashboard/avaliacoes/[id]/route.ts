import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { apagarAvaliacao, moderarAvaliacao } from "../../../../lib/avaliacoes/moderar"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"

/**
 * POST /dashboard/avaliacoes/:id — `{ acao: "aprovar" | "recusar" | "apagar" }`.
 * Aprovada, vai pro site (a loja é avisada); recusada, não vai — ou sai,
 * se estava lá. Apagar é de vez, e só a recusada (o pedido de exclusão da
 * LGPD — `apagarAvaliacao`). Fica no registro da equipe, com o produto e a
 * nota.
 *
 * RESPOSTAS: 200 `{ ok, situacao }` (`situacao: null` depois de apagar); 400
 * `acao`; 403 `sem_acesso`; 404 `nao_encontrada`; 409 `nao_recusada`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "avaliacoes")) return
  const acao = (req.body as { acao?: unknown } | undefined)?.acao
  if (acao !== "aprovar" && acao !== "recusar" && acao !== "apagar") {
    res.status(400).json({ message: "acao" })
    return
  }
  const id = req.params.id
  if (acao === "apagar") {
    const apagada = await apagarAvaliacao(req.scope, id)
    if (!apagada.ok) {
      res.status(apagada.motivo === "nao_encontrada" ? 404 : 409).json({ message: apagada.motivo })
      return
    }
    await anotar(pedido, "apagou-avaliacao", id, {
      produto: apagada.produto,
      nota: apagada.nota,
    })
    res.json({ ok: true, situacao: null })
    return
  }
  const r = await moderarAvaliacao(req.scope, id, acao, pedido.membro.id)
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  if (r.mudou) {
    await anotar(pedido, acao === "aprovar" ? "aprovou-avaliacao" : "recusou-avaliacao", id, {
      produto: r.produto,
      nota: r.nota,
    })
  }
  res.json({ ok: true, situacao: r.situacao })
}
