import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { ehIdDaSecaoDaHome } from "../../../../lib/home"
import { anotar } from "../../../../lib/painel/anotar"
import { mudarHome } from "../../../../lib/painel/gravar-home"
import { ALVO_DA_HOME, mudarOrdemNaHome, pendentesDaHome } from "../../../../lib/painel/home"
import { ehMudancaNaOrdem } from "../../../../lib/painel/produtos"

/**
 * POST /dashboard/home/ordem — `{ secao, mudanca }`: liga, desliga, sobe ou
 * desce UMA seção da home, NO RASCUNHO — o site só muda no "Publicar". A
 * mudança é aplicada sobre o rascunho gravado agora, não sobre a tela. Dono
 * e marketing.
 *
 * RESPOSTAS: 200 `{ pendentes }`; 400 `invalido`; 404 `sem_loja`; 409
 * `nao_da` (a fixa; subir a primeira; descer a última).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const { secao, mudanca } = (req.body ?? {}) as { secao?: unknown; mudanca?: unknown }
  if (!ehIdDaSecaoDaHome(secao) || !ehMudancaNaOrdem(mudanca)) {
    res.status(400).json({ message: "invalido" })
    return
  }
  const r = await mudarHome(req.scope, (home) => mudarOrdemNaHome(home, secao, mudanca))
  if (!r.ok) {
    res.status(r.motivo === "sem_loja" ? 404 : 409).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "mudou-secao-da-home", ALVO_DA_HOME, { secao, mudanca })
  res.json({ pendentes: pendentesDaHome(r.home) })
}
