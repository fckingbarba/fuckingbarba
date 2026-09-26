import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  avisarNoLog,
  configuracaoDoGa4,
  ErroDoGa4,
  visitasDoMarketing,
} from "../../../../lib/painel/ga4"
import { pedidosDesde } from "../../../../lib/painel/ler"
import {
  hostsDaLoja,
  lerPedidosDesde,
  lerPeriodo,
  vendasDos,
  visitasDoPeriodo,
} from "../../../../lib/painel/marketing"

/** O motivo de verdade vai pro log, no máximo uma linha por hora por motivo. */
const avisar = (req: AuthenticatedMedusaRequest, tipo: string, mensagem: string) =>
  avisarNoLog(req.scope, "as visitas do marketing", tipo, mensagem)

/**
 * GET /dashboard/marketing/visitas?periodo=30d — as visitas do período e do
 * de antes, do Google Analytics, e a conversão (pedidos pagos ÷ visitas, no
 * mesmo corte de hora — ver `visitasDoPeriodo`). Só as visitas do endereço
 * da loja (`LOJA_URL`): o Analytics é o mesmo do site antigo, da Nuvemshop.
 *
 * RESPOSTAS, sempre 200 (as mesmas do `/dashboard/visitas`):
 *   `{ estado: "ok", visitas, pedidos, conversao, ate }`;
 *   `{ estado: "desligado" | "invalida" | "recusado" | "fora" }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const cfg = configuracaoDoGa4()
  if (cfg === "desligado") {
    res.json({ estado: "desligado" })
    return
  }
  if (cfg === "invalida") {
    avisar(req, "invalida", "GA4_PROPERTY_ID ou GA4_CREDENCIAIS falta ou não se lê")
    res.json({ estado: "invalida" })
    return
  }
  try {
    const agora = new Date()
    const [relatorio, pedidos] = await Promise.all([
      visitasDoMarketing(cfg, periodo, hostsDaLoja(process.env.LOJA_URL), agora),
      pedidosDesde(req.scope, lerPedidosDesde(periodo, agora)),
    ])
    res.json({ estado: "ok", ...visitasDoPeriodo(relatorio, periodo, vendasDos(pedidos), agora) })
  } catch (e) {
    const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
    avisar(req, tipo, e instanceof Error ? e.message : String(e))
    res.json({ estado: tipo })
  }
}
