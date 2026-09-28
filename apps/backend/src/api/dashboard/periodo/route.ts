import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import {
  lerAtalho,
  lerPeriodo,
  periodoNaTela,
  type BuscaDoPeriodo,
} from "../../../lib/painel/periodo"

/**
 * GET /dashboard/periodo?… — o período que a barra de cima escolheu, pronto
 * pra tela (`PeriodoNaTela`: o nome, os dias, o de antes, o aviso), pela
 * regra do `lib/painel/periodo.ts` (entrega 0191). As abas do Marketing
 * desenham a barra com isto na hora, sem esperar os dados da aba (que podem
 * esperar o Google).
 *
 * `?padrao=`: o botão que a tela abre sem escolha (o Marketing, "30d"; sem
 * ele, "hoje", o do Início). Todo papel: é a área do Início, que todos abrem.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "inicio")) return
  const busca = req.query as BuscaDoPeriodo & { padrao?: unknown }
  res.json(periodoNaTela(lerPeriodo(busca, new Date(), lerAtalho(busca.padrao) ?? "hoje")))
}
