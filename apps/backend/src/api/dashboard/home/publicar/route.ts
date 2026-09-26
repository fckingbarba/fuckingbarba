import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { avisarDaHome, mudarHome } from "../../../../lib/painel/gravar-home"
import {
  ALVO_DA_HOME,
  pendentesDaHome,
  publicarHome,
  quantasMudancasNaHome,
} from "../../../../lib/painel/home"

/**
 * POST /dashboard/home/publicar — o rascunho vai pro site, e a loja é
 * avisada: a home muda em segundos. Dono e marketing.
 *
 * RESPOSTAS: 200 `{ lojaAvisada }`; 404 `sem_loja`; 409 `nada_pra_publicar`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  let mudancas = 0
  const r = await mudarHome(req.scope, (home) => {
    mudancas = quantasMudancasNaHome(pendentesDaHome(home))
    return publicarHome(home, new Date(), pedido.membro.nome)
  })
  if (!r.ok) {
    res.status(r.motivo === "sem_loja" ? 404 : 409).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "publicou-home", ALVO_DA_HOME, { mudancas })
  res.json({ lojaAvisada: await avisarDaHome(req.scope) })
}
