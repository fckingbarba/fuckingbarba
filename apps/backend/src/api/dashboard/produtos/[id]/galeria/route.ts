import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { ehDoArmazenamento } from "../../../../../lib/imagens"
import { anotar } from "../../../../../lib/painel/anotar"
import type { PedidoNaGaleria } from "../../../../../lib/painel/galeria"
import { mudarGaleriaDoProduto } from "../../../../../lib/painel/gravar-produto"
import { lerVideo } from "../../../../../lib/pdp"

/**
 * POST /dashboard/produtos/:id/galeria — UMA mudança nas fotos da dobra ou
 * nos vídeos da faixa "Vê na prática", na hora (sem "Salvar", como no
 * protótipo):
 *
 *   { acao: "incluir", item: { tipo: "foto", url } }                 — no fim das fotos
 *   { acao: "incluir", item: { tipo: "video", url, poster, largura, altura, duracao, titulo? } }
 *   { acao: "mover", url, para: "antes" | "depois" }                  — uma casa, entre os do mesmo tipo
 *   { acao: "tirar", url }
 *   { acao: "titular", url, titulo }                                  — o nome do vídeo ("" tira)
 *
 * Aplicada sobre a galeria gravada AGORA, dentro da trava do produto
 * (`mudarGaleriaDoProduto`). Foto e vídeo têm que estar no armazenamento da
 * loja (os que subiram por `/imagens` e por `/painel-envio`). A capa é
 * sempre foto. Dono e marketing.
 *
 * RESPOSTAS: 200 `{ galeria, lojaAvisada }`; 400 `invalido`, `repetido` ou
 * `cheia`; 404 `nao_encontrado`; 409 `nao_achei`, `ponta` ou `capa` (a
 * galeria mudou desde que a tela abriu).
 */

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function lerPedido(corpo: Record<string, unknown>): PedidoNaGaleria | null {
  const url = typeof corpo.url === "string" && corpo.url ? corpo.url : null
  if (corpo.acao === "tirar") return url ? { acao: "tirar", url } : null
  if (corpo.acao === "titular")
    return url && typeof corpo.titulo === "string" && corpo.titulo.length <= 200
      ? { acao: "titular", url, titulo: corpo.titulo }
      : null
  if (corpo.acao === "mover")
    return url && (corpo.para === "antes" || corpo.para === "depois")
      ? { acao: "mover", url, para: corpo.para }
      : null
  if (corpo.acao !== "incluir") return null
  const item = obj(corpo.item)
  if (item?.tipo === "foto") {
    const foto = typeof item.url === "string" ? item.url : ""
    return ehDoArmazenamento(foto) ? { acao: "incluir", item: { tipo: "foto", url: foto } } : null
  }
  if (item?.tipo === "video") {
    const video = lerVideo(item)
    return video && ehDoArmazenamento(video.url) && ehDoArmazenamento(video.poster)
      ? { acao: "incluir", item: { tipo: "video", ...video } }
      : null
  }
  return null
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const id = req.params.id
  if (!/^prod_[0-9A-Z]{10,40}$/.test(id)) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const mudanca = lerPedido(obj(req.body) ?? {})
  if (!mudanca) {
    res.status(400).json({ message: "invalido" })
    return
  }
  const r = await mudarGaleriaDoProduto(req.scope, id, mudanca)
  if (!r.ok) {
    const status =
      r.motivo === "nao_encontrado"
        ? 404
        : r.motivo === "repetido" || r.motivo === "cheia"
          ? 400
          : 409
    res.status(status).json({ message: r.motivo })
    return
  }
  const tipo =
    mudanca.acao === "incluir"
      ? mudanca.item.tipo
      : mudanca.acao === "titular" || /\.(mp4|webm)$/i.test(mudanca.url)
        ? "video"
        : "foto"
  await anotar(pedido, "mudou-galeria", id, {
    galeria: mudanca.acao,
    tipo,
    ...(mudanca.acao === "mover" ? { para: mudanca.para } : {}),
  })
  res.json({ galeria: r.galeria, lojaAvisada: r.lojaAvisada })
}
