import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../../../../lib/equipe/acesso"
import { ehTipoDeVideo, emitirEnvio, LIMITE_DO_VIDEO_EM_BYTES } from "../../../../../../lib/videos"

/**
 * POST /dashboard/produtos/:id/videos/envio — `{ tipo, tamanho }`: o bilhete
 * pra o navegador do painel mandar um vídeo direto pro Medusa
 * (`PUT /painel-envio/:bilhete`; o porquê em `lib/videos.ts`). O bilhete
 * vale uma vez, por 15 minutos, pra este produto, este tipo e este tamanho.
 * Dono e marketing.
 *
 * RESPOSTAS: 200 `{ caminho }` (o endereço, sem o domínio do Medusa — quem
 * pede sabe qual é); 400 `tipo` ou `grande`; 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const { tipo, tamanho } = (req.body ?? {}) as { tipo?: unknown; tamanho?: unknown }
  if (!ehTipoDeVideo(tipo)) {
    res.status(400).json({ message: "tipo" })
    return
  }
  if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho <= 0) {
    res.status(400).json({ message: "tipo" })
    return
  }
  if (tamanho > LIMITE_DO_VIDEO_EM_BYTES) {
    res.status(400).json({ message: "grande" })
    return
  }
  const id = req.params.id
  const [produto] = /^prod_[0-9A-Z]{10,40}$/.test(id)
    ? await req.scope.resolve(Modules.PRODUCT).listProducts({ id }, { select: ["id"], take: 1 })
    : []
  if (!produto) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const bilhete = emitirEnvio({ produtoId: id, membroId: pedido.membro.id, tipo, tamanho })
  res.json({ caminho: `/painel-envio/${bilhete}` })
}
