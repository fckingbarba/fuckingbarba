import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { lerCampanha } from "../../../../../lib/crm/campanhas"
import { exemplosDaCampanha, produtosDaLoja } from "../../../../../lib/crm/enviar-campanhas"
import { emailDoCrm } from "../../../../../lib/emails/crm"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"

/**
 * POST /dashboard/crm/campanhas/previa — `{ campanha }`: o "Ver como fica"
 * (entrega 0206). O e-mail do jeito que vai sair, no nome de quem pediu — o
 * assunto A e, com o teste, o B —, mesmo sem salvar.
 *
 * Quem abre o CRM. RESPOSTAS: 200 `{ emails: [{ assunto, html }] }`; 409
 * `sem_loja`; 422 `{ erros }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const publicados = new Set((await produtosDaLoja(req.scope)).map((p) => p.handle))
  const lida = lerCampanha((req.body as { campanha?: unknown } | undefined)?.campanha, {
    publicados,
    agora: new Date(),
    agendar: false,
  })
  if (!lida.ok) {
    res.status(422).json({ erros: lida.erros })
    return
  }
  const emails = await exemplosDaCampanha(req.scope, lida.campanha, {
    email: pedido.membro.email,
    nome: pedido.membro.nome ?? null,
  })
  if (!emails) {
    res.status(409).json({ message: "sem_loja" })
    return
  }
  res.json({ emails: emails.map((e) => ({ assunto: e.assunto, html: emailDoCrm(e).html })) })
}
