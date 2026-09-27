import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exemplosParaAEquipe } from "../../../../lib/crm/exemplos-dos-emails"
import { remetenteDoCrm } from "../../../../lib/email"
import { emailDoCrm } from "../../../../lib/emails/crm"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"

/**
 * GET /dashboard/crm/emails — o modelo dos e-mails do CRM (`lib/emails/crm.ts`):
 * os três exemplos, já montados (o HTML de cada um), com os produtos de
 * verdade da loja; pra quem vai o teste (o e-mail de quem pediu) e quem manda.
 *
 * Quem abre o CRM. RESPOSTAS: 200 `{ exemplos, para, remetente, umClique,
 * semLoja }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const { loja, exemplos } = await exemplosParaAEquipe(req.scope, pedido.membro)
  res.json({
    semLoja: !loja,
    para: pedido.membro.email,
    remetente: remetenteDoCrm(),
    umClique: exemplos.some((x) => x.email.sair.umClique),
    exemplos: exemplos.map((x) => {
      const e = emailDoCrm(x.email)
      return { id: x.id, nome: x.nome, assunto: e.assunto, previa: x.email.previa, html: e.html }
    }),
  })
}
