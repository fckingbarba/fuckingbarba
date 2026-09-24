import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { ehIdDaSecaoDaHome } from "../../../../lib/home"
import { anotar } from "../../../../lib/painel/anotar"
import { mudarHome } from "../../../../lib/painel/gravar-home"
import { ALVO_DA_HOME, pendentesDaHome, salvarSecaoDaHome } from "../../../../lib/painel/home"

/**
 * POST /dashboard/home/secao — `{ secao, valores }`: o texto de uma seção da
 * home, no "Salvar" da gaveta. Vai pro RASCUNHO: o site só muda no
 * "Publicar". Dono e marketing.
 *
 * Pela metade, não grava nada e devolve o que falta (`faltando`, as chaves
 * dos campos). Igual ao texto de fábrica, a seção volta a ser a de fábrica.
 *
 * RESPOSTAS: 200 `{ pendentes }`; 400 `secao_invalida`; 404 `sem_loja`; 422
 * `faltando`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const { secao, valores } = (req.body ?? {}) as { secao?: unknown; valores?: unknown }
  if (!ehIdDaSecaoDaHome(secao)) {
    res.status(400).json({ message: "secao_invalida" })
    return
  }
  const r = await mudarHome(req.scope, (home) => salvarSecaoDaHome(home, secao, valores))
  if (!r.ok) {
    res
      .status(r.motivo === "sem_loja" ? 404 : 422)
      .json({ message: r.motivo, ...(r.faltando ? { faltando: r.faltando } : {}) })
    return
  }
  await anotar(pedido, "editou-secao-da-home", ALVO_DA_HOME, { secao })
  res.json({ pendentes: pendentesDaHome(r.home) })
}
