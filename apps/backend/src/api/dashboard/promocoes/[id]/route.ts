import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, PromotionStatus } from "@medusajs/framework/utils"
import { updatePromotionsWorkflow } from "@medusajs/medusa/core-flows"
import type { PromocaoCrua } from "../../../../lib/cupons"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { valerNaLoja } from "../../../../lib/painel/promocoes"
import { ehPromocaoDoPainel } from "../../../../lib/promocoes"

/**
 * POST /dashboard/promocoes/:id — `{ acao: "pausar" | "ligar" }`: a chave da
 * promoção. Pausada, o Medusa não aplica mais — nem no carrinho que já
 * tinha o desconto: ele sai na próxima conferência do carrinho. E o produto
 * volta pras faixas de quantidade que ela tirava, e o selo sai da loja. Só
 * as promoções do painel (as automáticas `PROMO-`). Marketing e dono.
 *
 * RESPOSTAS: 200 `{ ok, ligado }`; 400 `acao`; 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const acao = (req.body as { acao?: unknown } | undefined)?.acao
  if (acao !== "pausar" && acao !== "ligar") {
    res.status(400).json({ message: "acao" })
    return
  }
  const id = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = /^promo_[0-9A-Z]{10,40}$/.test(id)
    ? await query.graph({
        entity: "promotion",
        fields: ["id", "code", "status", "is_automatic"],
        filters: { id },
      })
    : { data: [] }
  const promocao = (data as PromocaoCrua[])[0]
  if (!promocao || !ehPromocaoDoPainel(promocao)) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const status = acao === "ligar" ? PromotionStatus.ACTIVE : PromotionStatus.INACTIVE
  if (promocao.status !== status) {
    await updatePromotionsWorkflow(req.scope).run({
      input: { promotionsData: [{ id, status }] },
    })
    await anotar(pedido, acao === "ligar" ? "ligou-promocao" : "pausou-promocao", id, {
      codigo: promocao.code,
    })
    await valerNaLoja(req.scope)
  }
  res.json({ ok: true, ligado: acao === "ligar" })
}
