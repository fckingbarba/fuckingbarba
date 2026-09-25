import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { lerIntegracoes } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/integracoes — o código de cada integração
 * (GA4, Google Ads e o rótulo da compra, Pixel da Meta, Clarity, Pixel do
 * TikTok). Em branco desliga. A loja monta as tags com isto em segundos, e
 * só depois do "Aceitar" da faixa de cookies.
 *
 * RESPOSTAS: 200 `{ ok, lojaAvisada }`; 422 `{ erros }`, campo a campo;
 * 404 sem loja no Medusa.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const lido = lerIntegracoes(req.body)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, () => ({ integracoes: lido.valor }))
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-integracoes", "configuracoes", {
    ligadas: Object.entries(lido.valor)
      .filter(([, codigo]) => codigo)
      .map(([chave]) => chave),
  })
  res.json({ ok: true, lojaAvisada: r.lojaAvisada })
}
