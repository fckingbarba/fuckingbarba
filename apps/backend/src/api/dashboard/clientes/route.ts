import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { juntarPessoas, listaDeClientes } from "../../../lib/painel/clientes"
import { inscricoesDaNewsletter, lerClientes, pedidosDosClientes } from "../../../lib/painel/ler"

/**
 * GET /dashboard/clientes?busca= — a lista de clientes do painel: quem já
 * comprou ou tem conta, quantos pedidos, quanto gastou e se aceita ofertas.
 * Os três papéis abrem; o marketing vê só quem aceitou ofertas, e sem a
 * cidade (`listaDeClientes`, em `lib/painel/clientes.ts`). A busca procura
 * nome e e-mail.
 *
 * RESPOSTAS: 200 `{ clientes, total, comOfertas, busca }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "clientes")) return

  const q = req.query as { busca?: unknown }
  const busca = typeof q.busca === "string" ? q.busca.slice(0, 80) : ""
  const [clientes, pedidos, inscricoes] = await Promise.all([
    lerClientes(req.scope),
    pedidosDosClientes(req.scope),
    inscricoesDaNewsletter(req.scope),
  ])
  const pessoas = juntarPessoas(clientes, pedidos, inscricoes)
  res.json(listaDeClientes(pessoas, pedido.membro.papel, new Date(), busca))
}
