import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removerDaNewsletterWorkflow } from "../../../../workflows/newsletter/remover"

/**
 * DELETE /admin/newsletter/:id — tira da lista, de verdade.
 *
 * É o "pode sair quando quiser" do formulário e o pedido de exclusão da
 * LGPD: apaga a linha, sem marca de cancelado (ver o modelo). Se a pessoa se
 * inscrever de novo depois, é um consentimento novo, com data nova.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await removerDaNewsletterWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, removido: result.removida })
}
