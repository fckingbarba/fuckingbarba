import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { lerParcelamento } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/pagamento — `{ parcelaMinima: "30,00" }`: a
 * menor parcela do cartão (0157). Vale nas três pontas: o que a loja anuncia
 * ("3x de R$ X"), o que o checkout oferece e o que o Medusa aceita (a porta
 * da sessão de pagamento, `lib/pagamento/parcela.ts`). Nunca abaixo do piso
 * do banco.
 *
 * RESPOSTAS: 200 `{ ok, parcelaMinima, lojaAvisada }` (o valor gravado, em
 * reais); 422 `{ erros }`; 404 sem loja.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const lido = lerParcelamento(req.body)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, () => ({ pagamento: lido.valor }))
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-parcela-minima", "configuracoes", {
    parcelaMinima: lido.valor.parcelaMinima,
  })
  res.json({ ok: true, parcelaMinima: lido.valor.parcelaMinima, lojaAvisada: r.lojaAvisada })
}
