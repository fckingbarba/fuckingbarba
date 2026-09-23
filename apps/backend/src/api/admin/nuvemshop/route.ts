import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { previaDaNuvemshop, trazerDaNuvemshop } from "../../../lib/nuvemshop"

/**
 * GET  /admin/nuvemshop — a prévia: cada produto da loja antiga (Nuvemshop),
 *      o produto daqui com o mesmo SKU, e o que muda nele (endereço, fotos,
 *      categoria). Não muda nada.
 * POST /admin/nuvemshop — a troca, com `{ slugs }`: os produtos escolhidos na
 *      prévia. Devolve o relatório.
 *
 * O que muda em cada produto está em `lib/nuvemshop.ts`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const r = await previaDaNuvemshop(req.scope)
  if (!r.ok) {
    res.status(r.status).json({ message: r.motivo })
    return
  }
  res.json(r.previa)
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const slugs = (req.body as { slugs?: unknown } | undefined)?.slugs
  if (
    !Array.isArray(slugs) ||
    slugs.length > 500 ||
    !slugs.every((s) => typeof s === "string" && /^[a-z0-9-]{1,200}$/.test(s))
  ) {
    res.status(400).json({ message: "slugs é a lista dos endereços da Nuvemshop" })
    return
  }
  const r = await trazerDaNuvemshop(req.scope, slugs as string[])
  if (!r.ok) {
    res.status(r.status).json({ message: r.motivo })
    return
  }
  res.json({ relatorio: r.relatorio })
}
