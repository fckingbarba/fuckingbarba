import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { importarCatalogo, lerPrevia } from "../../../../lib/erp/catalogo"

/**
 * GET  /admin/erp/catalogo — a prévia: os produtos ativos do ERP, com o que
 *      acontece com cada um, e os do site. Não muda nada. Lê o ERP produto a
 *      produto: leva uns segundos por produto.
 * POST /admin/erp/catalogo — a importação, com `{ importar, remover }`: os
 *      ids no ERP dos que entram e os ids no site dos que saem (só os que a
 *      prévia mostrou). Devolve o relatório.
 *
 * O que acontece com cada produto está em `lib/erp/catalogo.ts`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const r = await lerPrevia(req.scope)
  if (!r.ok) {
    res.status(r.status).json({ message: r.motivo })
    return
  }
  res.json(r.previa)
}

const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 1000 && v.every((x) => typeof x === "string" && x.length <= 100)
    ? (v as string[])
    : null

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as { importar?: unknown; remover?: unknown }
  const importar = ids(corpo.importar ?? [])
  const remover = ids(corpo.remover ?? [])
  if (!importar || !remover) {
    res.status(400).json({ message: "importar e remover são listas de ids" })
    return
  }
  const r = await importarCatalogo(req.scope, { importar, remover })
  if (!r.ok) {
    res.status(r.status).json({ message: r.motivo })
    return
  }
  res.json({ relatorio: r.relatorio })
}
