import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { JANELA_DO_TOTAL_MS, montarInicio, precisamDoTotal } from "../../../lib/painel/inicio"
import {
  enviosDos,
  lerContexto,
  notasDos,
  numerosDaNewsletter,
  pedidosRecentes,
  quantosRascunhos,
  totaisDesde,
  totaisDos,
} from "../../../lib/painel/ler"

/**
 * GET /dashboard/inicio — a primeira tela do painel: o que precisa de você,
 * as vendas e os pedidos do dia, conforme o papel e o que ele abre agora
 * (`lib/painel/inicio.ts`).
 *
 * Os pedidos dos últimos 45 dias: é o que cobre a semana do gráfico e o
 * pedido pago que ficou parado sem sair — esse, quanto mais velho, mais
 * precisa aparecer.
 *
 * Lidos SEM o total; o total vem só dos que entram nos números em reais
 * (`precisamDoTotal`): os da semana, lidos junto com a janela (`totaisDesde`), e
 * o que ainda faltar (um pago agora de pedido velho) logo depois. O que não
 * depende um do outro sai junto.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "inicio")) return

  const papel = pedido.membro.papel
  const agora = new Date()
  // A fila do marketing: cada item só pra quem abre a área dele (sai junto com o resto).
  const marketing = papel === "marketing"
  const [ctx, pedidos, daSemana, newsletter, rascunhos] = await Promise.all([
    lerContexto(req.scope, agora),
    pedidosRecentes(req.scope, { limite: 500, dias: 45, agora, semTotal: true }),
    totaisDesde(req.scope, new Date(agora.getTime() - JANELA_DO_TOTAL_MS)),
    marketing && abre(pedido, "newsletter") ? numerosDaNewsletter(req.scope, agora) : null,
    marketing && abre(pedido, "produtos") ? quantosRascunhos(req.scope) : null,
  ])
  const ids = pedidos.map((o) => o.id)
  const faltam = precisamDoTotal(pedidos, agora).filter((id) => !daSemana.has(id))
  const [notas, envios, outros] = await Promise.all([
    notasDos(req.scope, ids),
    enviosDos(req.scope, ids),
    totaisDos(req.scope, faltam),
  ])
  for (const o of pedidos) {
    const t = daSemana.get(o.id) ?? outros.get(o.id)
    if (t) Object.assign(o, { total: t.total, credit_line_total: t.credit_line_total })
  }
  const doMarketing = {
    ...(newsletter !== null ? { newsletter } : {}),
    ...(rascunhos !== null ? { rascunhos } : {}),
  }

  res.json(
    montarInicio({ papel, areas: pedido.areas }, { pedidos, notas, envios, ...doMarketing }, ctx)
  )
}
