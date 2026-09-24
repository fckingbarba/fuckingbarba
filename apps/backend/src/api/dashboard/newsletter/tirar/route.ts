import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { emailMascarado } from "../../../../lib/painel/clientes"
import { inscricoesDaNewsletter, lerClientes } from "../../../../lib/painel/ler"
import { removerDaNewsletterWorkflow } from "../../../../workflows/newsletter/remover"

/**
 * POST /dashboard/newsletter/tirar — `{ email }`: tira o e-mail de quem
 * recebe ofertas, de verdade. É o "pode sair quando quiser" da Política de
 * Privacidade, pedido pelo cliente à loja. Nos dois lugares onde o "sim"
 * mora: a inscrição da newsletter é APAGADA (como no admin: sem marca de
 * cancelado), e a caixa de ofertas por e-mail da conta desmarca (a do
 * WhatsApp fica como está). Se a pessoa quiser de novo depois, é um "sim"
 * novo, com data nova.
 *
 * Fica no registro da equipe, com o e-mail mascarado. Marketing e dono.
 *
 * RESPOSTAS: 200 `{ ok, newsletter, contas }` (o que saiu de cada lugar);
 * 400 `email`; 404 `nao_encontrado` (o e-mail não estava na lista).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "newsletter")) return

  const bruto = (req.body as { email?: unknown } | undefined)?.email
  const email = typeof bruto === "string" ? bruto.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) {
    res.status(400).json({ message: "email" })
    return
  }

  const [inscricoes, clientes] = await Promise.all([
    inscricoesDaNewsletter(req.scope, { email }),
    lerClientes(req.scope, { email }),
  ])
  const comCaixa = clientes.filter((c) => {
    const ofertas = (c.metadata?.ofertas ?? null) as Record<string, unknown> | null
    return Boolean(ofertas?.email)
  })
  if (!inscricoes.length && !comCaixa.length) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }

  for (const i of inscricoes) await removerDaNewsletterWorkflow(req.scope).run({ input: i.id })
  for (const c of comCaixa) {
    const ofertas = (c.metadata?.ofertas ?? {}) as Record<string, unknown>
    // O Medusa junta o metadata no primeiro nível: só as `ofertas` mudam.
    await updateCustomersWorkflow(req.scope).run({
      input: {
        selector: { id: c.id },
        update: { metadata: { ofertas: { ...ofertas, email: null } } },
      },
    })
  }

  await anotar(pedido, "tirou-da-newsletter", "newsletter", {
    email: emailMascarado(email),
    newsletter: inscricoes.length > 0,
    contas: comCaixa.length,
  })
  res.json({ ok: true, newsletter: inscricoes.length > 0, contas: comCaixa.length })
}
