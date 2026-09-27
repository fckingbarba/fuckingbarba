import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { exemploDoToque, TOQUES_DOS_FLUXOS } from "../../../../../lib/crm/exemplos-dos-fluxos"
import type { IdDoToque } from "../../../../../lib/crm/fluxos"
import { enviarEmail, remetenteDoCrm } from "../../../../../lib/email"
import { emailDoCrm } from "../../../../../lib/emails/crm"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { criarLimite } from "../../../../../lib/limite"

/**
 * POST /dashboard/crm/fluxos/teste — `{ toque }`: manda um toque dos fluxos
 * (`lib/crm/exemplos-dos-fluxos.ts`) pro e-mail de quem pediu, com [Teste]
 * no assunto e a etiqueta `crm-teste` (fica fora das contas do CRM).
 *
 * Quem abre o CRM; 10 por hora por pessoa. RESPOSTAS: 200 `{ ok, para }`;
 * 400 `toque`; 409 `sem_loja`; 429 `limite`; 502 `nao_saiu`.
 */

const LIMITE = { limite: 10, ms: 60 * 60 * 1000 }
const limite = criarLimite()

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const toque = (req.body as { toque?: unknown } | undefined)?.toque
  if (!TOQUES_DOS_FLUXOS.includes(toque as IdDoToque)) {
    res.status(400).json({ message: "toque" })
    return
  }
  const exemplo = await exemploDoToque(req.scope, pedido.membro, toque as IdDoToque)
  if (!exemplo) {
    res.status(409).json({ message: "sem_loja" })
    return
  }
  if (!limite.cabe(pedido.membro.id, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(pedido.membro.id, LIMITE)
  const email = emailDoCrm(exemplo)
  const r = await enviarEmail(
    { ...email, assunto: `[Teste] ${email.assunto}`, remetente: remetenteDoCrm() },
    req.scope.resolve(ContainerRegistrationKeys.LOGGER),
    { tipo: "crm-teste" }
  )
  if (!r.ok) {
    res.status(502).json({ message: "nao_saiu" })
    return
  }
  res.json({ ok: true, para: pedido.membro.email })
}
