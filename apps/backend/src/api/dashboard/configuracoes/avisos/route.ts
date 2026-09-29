import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { lerAvisoDaVenda } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/avisos — `{ vendaPara: "loja@gmail.com" }`:
 * pra onde vai o e-mail da venda nova (0219). Preenchido, vai SÓ pra ele;
 * em branco, volta pros donos do painel (`lib/avisar-venda.ts`).
 *
 * RESPOSTAS: 200 `{ ok, vendaPara }` (`null` = os donos); 422 `{ erros }`;
 * 404 sem loja.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const lido = lerAvisoDaVenda(req.body)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, () => ({ avisos: lido.valor }))
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-email-da-venda", "configuracoes", {
    vendaPara: lido.valor.vendaPara,
  })
  res.json({ ok: true, vendaPara: lido.valor.vendaPara })
}
