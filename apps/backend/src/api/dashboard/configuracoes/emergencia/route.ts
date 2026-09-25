import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { lerEmergencia } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/emergencia — `{ preco, prazo }`: o que a
 * loja cobra, e promete, se a Frenet cair. Preço em branco: não vende sem
 * cotar (o padrão). Vale na próxima cotação.
 *
 * RESPOSTAS: 200 `{ ok, lojaAvisada }`; 422 `{ erros }`; 404 sem loja.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const lido = lerEmergencia(req.body)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, () => ({ cotacao: lido.valor }))
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-frete-de-emergencia", "configuracoes", {
    preco: lido.valor.precoDeEmergencia,
    prazo: lido.valor.prazoDeEmergencia,
  })
  res.json({ ok: true, lojaAvisada: r.lojaAvisada })
}
