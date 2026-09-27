import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { emailMascarado } from "../../../../lib/painel/clientes"
import { tirarDasOfertas } from "../../../../lib/ofertas"

/**
 * POST /dashboard/newsletter/tirar — `{ email }`: tira o e-mail de quem
 * recebe ofertas, de verdade. É o "pode sair quando quiser" da Política de
 * Privacidade, pedido pelo cliente à loja. Em todos os lugares onde o "sim"
 * mora (`tirarDasOfertas`, `lib/ofertas.ts`): a newsletter, a caixa da conta,
 * os avisos de produto esgotado e a base da Nuvemshop. O mesmo miolo do link
 * de sair da lista dos e-mails do CRM.
 *
 * Fica no registro da equipe, com o e-mail mascarado. Marketing e dono.
 *
 * RESPOSTAS: 200 `{ ok, newsletter, contas, avisos, base }` (o que saiu de
 * cada lugar); 400 `email`; 404 `nao_encontrado` (o e-mail não estava em
 * lugar nenhum).
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

  const saiu = await tirarDasOfertas(req.scope, email)
  if (!saiu.newsletter && !saiu.contas && !saiu.avisos && !saiu.base) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }

  await anotar(pedido, "tirou-da-newsletter", "newsletter", {
    email: emailMascarado(email),
    ...saiu,
  })
  res.json({ ok: true, ...saiu })
}
