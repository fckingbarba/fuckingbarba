import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { numerosDaNewsletter, pedidosComPagamento } from "../../../../lib/painel/ler"
import { janelasDo, lerPeriodo } from "../../../../lib/painel/marketing"
import { montarClientes } from "../../../../lib/painel/marketing-clientes"

/**
 * GET /dashboard/marketing/clientes?periodo=30d — quem compra, se volta, em
 * quanto tempo e de onde (`lib/painel/marketing-clientes.ts`), e a
 * newsletter. Lê a história inteira da loja nova: a primeira compra de cada
 * pessoa pode ser de antes do período. Do dono e do marketing; nenhum
 * e-mail sai daqui, só a conta.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const [pedidos, newsletter] = await Promise.all([
    pedidosComPagamento(req.scope, null),
    numerosDaNewsletter(req.scope, agora),
  ])
  res.json({
    periodo,
    newsletter,
    ...montarClientes(pedidos, janelasDo(periodo, agora).atual),
  })
}
