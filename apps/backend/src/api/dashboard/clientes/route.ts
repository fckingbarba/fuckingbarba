import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import {
  comGastos,
  juntarPessoas,
  listaDeClientes,
  vendidosDaPagina,
} from "../../../lib/painel/clientes"
import {
  inscricoesDaNewsletter,
  lerClientes,
  pedidosDosClientes,
  totaisDos,
} from "../../../lib/painel/ler"
import { lerPagina, paginar } from "../../../lib/painel/paginas"

/**
 * GET /dashboard/clientes?busca= — a lista de clientes do painel: quem já
 * comprou ou tem conta, quantos pedidos, quanto gastou e se aceita ofertas.
 * Os três papéis abrem; o marketing vê só quem aceitou ofertas, e sem a
 * cidade (`listaDeClientes`, em `lib/painel/clientes.ts`). A busca procura
 * nome e e-mail.
 *
 * Em páginas de 30 (`?pagina=`): `total` e `comOfertas` contam todos, e
 * `paginacao.itens`, os que a busca achou.
 *
 * RESPOSTAS: 200 `{ clientes, total, comOfertas, busca, paginacao }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "clientes")) return

  const q = req.query as { busca?: unknown; pagina?: unknown }
  const busca = typeof q.busca === "string" ? q.busca.slice(0, 80) : ""
  const [clientes, pedidos, inscricoes] = await Promise.all([
    lerClientes(req.scope),
    pedidosDosClientes(req.scope, { semTotal: true }),
    inscricoesDaNewsletter(req.scope),
  ])
  const pessoas = juntarPessoas(clientes, pedidos, inscricoes)
  const lista = listaDeClientes(pessoas, pedido.membro.papel, new Date(), busca)
  const { itens, paginacao } = paginar(lista.clientes, lerPagina(q.pagina))
  // O "gastou" só de quem está na página: o total dos pedidos vendidos dessas pessoas.
  const totais = await totaisDos(req.scope, vendidosDaPagina(itens, pessoas))
  res.json({ ...lista, clientes: comGastos(itens, pessoas, totais), paginacao })
}
