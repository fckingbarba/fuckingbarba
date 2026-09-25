import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { podeVer, problemaNaTela } from "../../../../../lib/painel/observabilidade"
import type { LinhaDoProblema } from "../../../../../lib/painel/observabilidade"
import { OBSERVABILIDADE } from "../../../../../modules/observabilidade"
import type ObservabilidadeService from "../../../../../modules/observabilidade/service"
import { resolverProblemaWorkflow } from "../../../../../workflows/observabilidade/resolver-problema"

/**
 * POST /dashboard/observabilidade/problemas/:id — `{ acao: "resolver" }`:
 * "marcar como resolvido" (ou "como visto"). Só o problema de evento: o de
 * estado sai sozinho quando o estado muda, e marcar não mudaria nada. Quem
 * marcou fica no problema e no registro da equipe.
 *
 * RESPOSTAS: 200 `{ problema }`; 400 `acao`; 404 `nao_encontrado` (inclusive
 * o que o papel não vê); 409 `sai_sozinho` ou `ja_resolvido`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "observabilidade")) return

  if ((req.body as { acao?: unknown } | undefined)?.acao !== "resolver") {
    res.status(400).json({ message: "acao" })
    return
  }
  const id = req.params.id
  const obs = req.scope.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const [p] = /^prob_[0-9A-Z]{10,40}$/.test(id)
    ? ((await obs.listProblemas({ id }, { take: 1 })) as unknown as LinhaDoProblema[])
    : []
  const papel = pedido.membro.papel
  if (!p || !podeVer(papel, p)) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  if (p.sozinho || p.situacao === "resolvido") {
    res.status(409).json({ message: p.sozinho ? "sai_sozinho" : "ja_resolvido" })
    return
  }

  const { result } = await resolverProblemaWorkflow(req.scope).run({
    input: { id, membroId: pedido.membro.id, nome: pedido.membro.nome },
  })
  await anotar(pedido, "resolveu-problema", id, { titulo: p.titulo })
  res.json({ problema: problemaNaTela(result as unknown as LinhaDoProblema, papel, new Date()) })
}
