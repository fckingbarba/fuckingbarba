import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { fichaDoCliente, juntarPessoas } from "../../../../lib/painel/clientes"
import {
  enviosDos,
  inscricoesDaNewsletter,
  lerClientes,
  lerContexto,
  notasDos,
  pedidosDe,
} from "../../../../lib/painel/ler"

/**
 * GET /dashboard/clientes/:id — a ficha de um cliente: os dados, as ofertas
 * que ele aceitou (na conta e na newsletter) e os pedidos. O `id` é o de um
 * cliente do Medusa; a ficha junta todos os clientes com o mesmo e-mail (o
 * convidado de cada checkout e o da conta são a mesma pessoa).
 *
 * O papel decide o que sai (`fichaDoCliente`): o CPF inteiro só pro dono; o
 * marketing, sem celular, CPF, endereço e pedidos — e só de quem aceitou
 * ofertas: os outros, pra ele, não existem (404).
 *
 * RESPOSTAS: 200 `{ cliente }`; 404 `nao_encontrado`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "clientes")) return

  const id = req.params.id
  const [este] = /^cus_[0-9A-Z]{10,40}$/.test(id) ? await lerClientes(req.scope, { id }) : []
  const email = este?.email?.trim()
  if (!este || !email) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const [clientes, inscricoes, ctx] = await Promise.all([
    lerClientes(req.scope, { email }),
    inscricoesDaNewsletter(req.scope, { email }),
    lerContexto(req.scope),
  ])
  const todos = clientes.some((c) => c.id === este.id) ? clientes : [este, ...clientes]
  const pedidos = await pedidosDe(
    req.scope,
    todos.map((c) => c.id)
  )
  const ids = pedidos.map((o) => o.id)
  const [notas, envios] = await Promise.all([notasDos(req.scope, ids), enviosDos(req.scope, ids)])
  const [pessoa] = juntarPessoas(todos, pedidos, inscricoes)
  const ficha = pessoa ? fichaDoCliente(pessoa, pedido.membro.papel, ctx, notas, envios) : null
  if (!ficha) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  res.json({ cliente: ficha })
}
