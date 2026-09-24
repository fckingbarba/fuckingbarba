import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { montarInicio } from "../../../lib/painel/inicio"
import {
  enviosDos,
  lerContexto,
  notasDos,
  numerosDaNewsletter,
  pedidosRecentes,
  quantosRascunhos,
} from "../../../lib/painel/ler"

/**
 * GET /dashboard/inicio — a primeira tela do painel: o que precisa de você,
 * as vendas e os pedidos do dia, conforme o papel (`lib/painel/inicio.ts`).
 *
 * Os pedidos dos últimos 45 dias: é o que cobre a semana do gráfico e o
 * pedido pago que ficou parado sem sair — esse, quanto mais velho, mais
 * precisa aparecer.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "inicio")) return

  const papel = pedido.membro.papel
  const ctx = await lerContexto(req.scope)
  const pedidos = await pedidosRecentes(req.scope, { limite: 500, dias: 45, agora: ctx.agora })
  const ids = pedidos.map((o) => o.id)
  const [notas, envios] = await Promise.all([notasDos(req.scope, ids), enviosDos(req.scope, ids)])
  const doMarketing =
    papel === "marketing"
      ? {
          newsletter: await numerosDaNewsletter(req.scope, ctx.agora),
          rascunhos: await quantosRascunhos(req.scope),
        }
      : {}

  res.json(montarInicio(papel, { pedidos, notas, envios, ...doMarketing }, ctx))
}
