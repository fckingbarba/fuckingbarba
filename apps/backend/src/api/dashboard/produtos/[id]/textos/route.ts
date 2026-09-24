import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarProduto } from "../../../../../lib/painel/gravar-produto"
import { lerCategorias } from "../../../../../lib/painel/ler-produtos"

/** A linha embaixo do nome: curta, uma frase. */
const LIMITE_DO_SUBTITULO = 120

/**
 * POST /dashboard/produtos/:id/textos — `{ subtitulo, categoriaId }`: o
 * subtítulo (a linha embaixo do nome) e a categoria do produto. O resto dos
 * textos — nome e descrição — vem do Bling e não se muda aqui. Dono e
 * marketing.
 *
 * RESPOSTAS: 200 `{ lojaAvisada }`; 400 `subtitulo_longo` ou
 * `categoria_invalida`; 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const corpo = (req.body ?? {}) as { subtitulo?: unknown; categoriaId?: unknown }
  const subtitulo =
    typeof corpo.subtitulo === "string" ? corpo.subtitulo.replace(/\s+/g, " ").trim() : ""
  if (subtitulo.length > LIMITE_DO_SUBTITULO) {
    res.status(400).json({ message: "subtitulo_longo" })
    return
  }
  const categoriaId =
    typeof corpo.categoriaId === "string" && corpo.categoriaId ? corpo.categoriaId : null
  if (categoriaId && !(await lerCategorias(req.scope)).some((c) => c.id === categoriaId)) {
    res.status(400).json({ message: "categoria_invalida" })
    return
  }
  const r = await mudarProduto(req.scope, req.params.id, {
    subtitle: subtitulo || null,
    category_ids: categoriaId ? [categoriaId] : [],
  })
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "editou-textos", req.params.id, { categoria: categoriaId })
  res.json({ lojaAvisada: r.lojaAvisada })
}
