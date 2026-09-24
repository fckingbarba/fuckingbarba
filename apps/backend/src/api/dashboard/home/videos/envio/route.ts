import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { ehTipoDeVideo, emitirEnvio, LIMITE_DO_VIDEO_EM_BYTES } from "../../../../../lib/videos"

/**
 * POST /dashboard/home/videos/envio — `{ tipo, tamanho }`: o bilhete pra o
 * navegador do painel mandar o vídeo da história da marca direto pro Medusa
 * (`PUT /painel-envio/:bilhete`; o porquê em `lib/videos.ts`). O mesmo da
 * página do produto, com a home de destino. Sobe e não grava: o endereço
 * vai pro rascunho no "Salvar" do "Sobre a marca". Dono e marketing.
 *
 * RESPOSTAS: 200 `{ caminho }` (o endereço, sem o domínio do Medusa — quem
 * pede sabe qual é); 400 `tipo` ou `grande`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const { tipo, tamanho } = (req.body ?? {}) as { tipo?: unknown; tamanho?: unknown }
  if (
    !ehTipoDeVideo(tipo) ||
    typeof tamanho !== "number" ||
    !Number.isInteger(tamanho) ||
    tamanho <= 0
  ) {
    res.status(400).json({ message: "tipo" })
    return
  }
  if (tamanho > LIMITE_DO_VIDEO_EM_BYTES) {
    res.status(400).json({ message: "grande" })
    return
  }
  const bilhete = emitirEnvio({ destino: "home", membroId: pedido.membro.id, tipo, tamanho })
  res.json({ caminho: `/painel-envio/${bilhete}` })
}
