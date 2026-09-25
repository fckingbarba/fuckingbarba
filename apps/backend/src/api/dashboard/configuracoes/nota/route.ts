import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { atualizarConexao } from "../../../../lib/erp/conexao"
import { erpDaTela } from "../../../../lib/erp/erps"
import { anotar } from "../../../../lib/painel/anotar"
import { ehJanela } from "../../../../lib/painel/configuracoes"

/**
 * POST /dashboard/configuracoes/nota — `{ janela }`: quantos minutos a nota
 * espera depois do pagamento (0, 5, 15, 30, 60, 120 ou 240: as `JANELAS`, as
 * mesmas da tela do ERP no admin) — a janela em que dá pra cancelar sem nota.
 * Vale também pros pedidos que já estão esperando: a janela conta do
 * pagamento, a cada vez (como no admin do ERP).
 *
 * RESPOSTAS: 200 `{ ok, janela }`; 400 `janela`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const janela = (req.body as { janela?: unknown } | undefined)?.janela
  if (!ehJanela(janela)) {
    res.status(400).json({ message: "janela" })
    return
  }
  await atualizarConexao(req.scope, erpDaTela(), { janela_da_nota: janela })
  await anotar(pedido, "mudou-janela-da-nota", "configuracoes", { minutos: janela })
  res.json({ ok: true, janela })
}
