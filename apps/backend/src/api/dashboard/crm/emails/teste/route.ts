import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { exemplosParaAEquipe } from "../../../../../lib/crm/exemplos-dos-emails"
import { enviarEmail, remetenteDoCrm } from "../../../../../lib/email"
import { emailDoCrm } from "../../../../../lib/emails/crm"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { criarLimite } from "../../../../../lib/limite"

/**
 * POST /dashboard/crm/emails/teste — `{ exemplo }`: manda um dos exemplos do
 * modelo pro e-mail de quem pediu, pra ver no celular e no computador como
 * fica de verdade. Sai com o remetente do CRM, os cabeçalhos do sair da
 * lista e a etiqueta `crm-teste` — e, por ir pra alguém da equipe, fica
 * fora das contas do CRM.
 *
 * Quem abre o CRM; 10 por hora por pessoa. RESPOSTAS: 200 `{ ok, para }`;
 * 400 `exemplo`; 429 `limite`; 502 `nao_saiu`; 409 `sem_loja`.
 */

const LIMITE = { limite: 10, ms: 60 * 60 * 1000 }
const limite = criarLimite()

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const id = (req.body as { exemplo?: unknown } | undefined)?.exemplo
  const { loja, exemplos } = await exemplosParaAEquipe(req.scope, pedido.membro)
  if (!loja) {
    res.status(409).json({ message: "sem_loja" })
    return
  }
  const exemplo = exemplos.find((x) => x.id === id)
  if (!exemplo) {
    res.status(400).json({ message: "exemplo" })
    return
  }
  if (!limite.cabe(pedido.membro.id, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(pedido.membro.id, LIMITE)
  const email = emailDoCrm(exemplo.email)
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
