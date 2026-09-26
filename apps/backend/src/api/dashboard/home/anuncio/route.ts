import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { mudarHome } from "../../../../lib/painel/gravar-home"
import {
  ALVO_DA_HOME,
  ID_DO_ANUNCIO,
  pendentesDaHome,
  salvarAnuncioDaHome,
} from "../../../../lib/painel/home"

/**
 * POST /dashboard/home/anuncio — `{ valores }`: a barra de avisos (a esteira
 * amarela do topo de toda página), no "Salvar" da gaveta dela. Vai pro
 * RASCUNHO, como o texto das seções: o site só muda no "Publicar". Dono e
 * marketing.
 *
 * `valores`: `{ frete, avisos }` — o aviso do frete (das configurações da
 * loja) liga ou desliga; os avisos escritos são pelo menos um. Sem nenhum,
 * não grava e devolve o que falta. Igual ao de fábrica, volta a ser o de
 * fábrica. Na linha do registro, a barra vai no lugar da seção (`secao:
 * "anuncio"`), como "editou" as seções.
 *
 * RESPOSTAS: 200 `{ pendentes }`; 404 `sem_loja`; 422 `faltando`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const { valores } = (req.body ?? {}) as { valores?: unknown }
  const r = await mudarHome(req.scope, (home) => salvarAnuncioDaHome(home, valores))
  if (!r.ok) {
    res
      .status(r.motivo === "sem_loja" ? 404 : 422)
      .json({ message: r.motivo, ...(r.faltando ? { faltando: r.faltando } : {}) })
    return
  }
  await anotar(pedido, "editou-secao-da-home", ALVO_DA_HOME, { secao: ID_DO_ANUNCIO })
  res.json({ pendentes: pendentesDaHome(r.home) })
}
