import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarPdp } from "../../../../../lib/painel/gravar-produto"
import { lerProdutos } from "../../../../../lib/painel/ler-produtos"
import { caixaDo, salvarCaixa } from "../../../../../lib/painel/produtos"

/**
 * POST /dashboard/produtos/:id/caixa — `{ modo, nota, junto }`: o que a
 * caixa de compra mostra logo abaixo do preço, UMA coisa ou outra — os
 * cartões "Quantas unidades" (com a linha opcional embaixo de "1 unidade")
 * ou o "Leve junto", com até 2 produtos no site (nunca o próprio). Dono e
 * marketing.
 *
 * RESPOSTAS: 200 `{ caixa, lojaAvisada }`; 400 `junto_vazio`,
 * `junto_invalido` ou `nota_longa`; 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const id = req.params.id
  const podem = new Set(
    (await lerProdutos(req.scope))
      .filter((p) => p.status === "published" && p.handle && p.id !== id)
      .map((p) => p.handle!)
  )
  const corpo = (req.body ?? {}) as { modo?: unknown; nota?: unknown; junto?: unknown }
  const r = await mudarPdp(req.scope, id, (pdp) => {
    const caixa = salvarCaixa({ modo: corpo.modo, nota: corpo.nota, junto: corpo.junto }, podem)
    return caixa.ok
      ? { ok: true, pdp: { ...pdp, combinada: caixa.combinada } }
      : { ok: false, motivo: caixa.motivo }
  })
  if (!r.ok) {
    res.status(r.motivo === "nao_encontrado" ? 404 : 400).json({ message: r.motivo })
    return
  }
  const caixa = caixaDo(r.pdp.combinada)
  await anotar(pedido, "mudou-caixa", id, { modo: caixa.modo, junto: caixa.junto })
  res.json({ caixa, lojaAvisada: r.lojaAvisada })
}
