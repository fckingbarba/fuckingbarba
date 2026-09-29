import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { lerCampanha } from "../../../../../lib/crm/campanhas"
import { exemplosDaCampanha, produtosDaLoja } from "../../../../../lib/crm/enviar-campanhas"
import { comQuemManda } from "../../../../../lib/crm/envio"
import { enviarEmail } from "../../../../../lib/email"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { criarLimite } from "../../../../../lib/limite"

/**
 * POST /dashboard/crm/campanhas/teste — `{ campanha }`: o "Mandar pra mim"
 * das campanhas (entrega 0206), mesmo sem salvar. O e-mail de quem pediu
 * recebe o assunto A e, com o teste, o B, com [Teste] no assunto e a etiqueta
 * `crm-teste` (fica fora das contas do CRM).
 *
 * Quem abre o CRM; 10 pedidos por hora por pessoa. RESPOSTAS: 200 `{ ok,
 * para, quantos }`; 409 `sem_loja`; 422 `{ erros }`; 429 `limite`; 502
 * `nao_saiu`.
 */

const LIMITE = { limite: 10, ms: 60 * 60 * 1000 }
const limite = criarLimite()

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
  if (!limite.cabe(pedido.membro.id, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(pedido.membro.id, LIMITE)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  for (const e of emails) {
    const email = comQuemManda(e)
    const r = await enviarEmail({ ...email, assunto: `[Teste] ${email.assunto}` }, logger, {
      tipo: "crm-teste",
    })
    if (!r.ok) {
      res.status(502).json({ message: "nao_saiu" })
      return
    }
  }
  res.json({ ok: true, para: pedido.membro.email, quantos: emails.length })
}
