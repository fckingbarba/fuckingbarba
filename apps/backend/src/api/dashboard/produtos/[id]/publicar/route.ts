import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarProduto } from "../../../../../lib/painel/gravar-produto"
import { lerProduto } from "../../../../../lib/painel/ler-produtos"
import { precoDo } from "../../../../../lib/painel/produtos"

/**
 * POST /dashboard/produtos/:id/publicar — o rascunho vai pro site. É o caso
 * do produto novo que chega do Bling: todo SKU novo entra em rascunho e sem
 * categoria, pra alguém revisar antes. Sem preço não publica (a página não
 * venderia); sem foto ou sem categoria, a tela avisa antes, e publica se a
 * pessoa quiser. Dono e marketing.
 *
 * RESPOSTAS: 200 `{ lojaAvisada }`; 404 `nao_encontrado`; 409
 * `ja_publicado` ou `sem_preco`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const p = /^prod_[0-9A-Z]{10,40}$/.test(req.params.id)
    ? await lerProduto(req.scope, req.params.id)
    : null
  if (!p) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  if (p.status === "published") {
    res.status(409).json({ message: "ja_publicado" })
    return
  }
  if (!precoDo(p)) {
    res.status(409).json({ message: "sem_preco" })
    return
  }
  const r = await mudarProduto(req.scope, p.id, { status: ProductStatus.PUBLISHED })
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "publicou", p.id, {})
  res.json({ lojaAvisada: r.lojaAvisada })
}
