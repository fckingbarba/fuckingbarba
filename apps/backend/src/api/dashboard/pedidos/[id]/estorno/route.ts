import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { tentarEstornoAgora } from "../../../../../lib/estornos"
import {
  estornoPraTentar,
  fraseDoEstorno,
  PEDIU_ESTORNO,
  registroDoEstorno,
} from "../../../../../lib/painel/acoes"
import { pedidoPorId } from "../../../../../lib/painel/ler"
import { anotarNoPedidoWorkflow } from "../../../../../workflows/equipe/anotar"

/**
 * POST /dashboard/pedidos/:id/estorno — "Tentar o estorno de novo", o botão
 * da faixa vermelha do pedido. SÓ O DONO (a área `estornos`): é dinheiro de
 * cliente.
 *
 * É o mesmo do admin (`POST /admin/pedidos/:id/estorno`, `lib/estornos.ts`):
 * confere a cobrança no Pagar.me e, se o estorno do pagamento inteiro falhou
 * e nada está andando, pede de novo na hora. Só nos pedidos em que o botão
 * aparece (`estornoPraTentar`) — o estorno parcial fica pro painel do
 * Pagar.me. Feito, fica no registro da equipe: quem apertou, quando e no
 * que deu.
 *
 * RESPOSTAS: 200 `{ ok, texto }`; 403 `sem_acesso` (não é o dono);
 * 404 `nao_encontrado`; 409 `nada_a_fazer`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "estornos")) return

  const id = req.params.id
  const o = /^order_[0-9A-Z]{10,40}$/.test(id) ? await pedidoPorId(req.scope, id) : null
  if (!o) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  if (!estornoPraTentar(o.metadata)) {
    res.status(409).json({ message: "nada_a_fazer" })
    return
  }

  const tentativa = await tentarEstornoAgora(req.scope, id)
  await anotarNoPedidoWorkflow(req.scope)
    .run({
      input: {
        membro_id: pedido.membro.id,
        acao: PEDIU_ESTORNO,
        alvo_id: id,
        detalhe: registroDoEstorno(tentativa, Number(o.display_id ?? 0)),
      },
    })
    .catch((e: unknown) =>
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[painel] o estorno do #${o.display_id} andou, mas o registro não gravou: ${e}`)
    )
  res.json(fraseDoEstorno(tentativa))
}
