import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../../lib/equipe/acesso"
import { planoDoApagar } from "../../../../../../lib/financeiro/despesas"
import { aplicar, despesaVista } from "../../../../../../lib/financeiro/gravar"
import { anotar } from "../../../../../../lib/painel/anotar"

/**
 * POST /dashboard/financeiro/despesas/:id/apagar — `{ visto }`: apaga a
 * despesa que a pessoa via no mês `visto`. A de um mês só some; a que repete
 * some inteira (vista no primeiro mês) ou para no mês de antes ("tirar deste
 * mês em diante").
 *
 * RESPOSTAS: 200 `{ ok, parou }` (`parou`: a que repete ficou nos meses de
 * antes); 404 `{ erro: "nao_achou" }`; 422 `{ erro: "campo", campo: "mes" }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const corpo = (req.body ?? {}) as Record<string, unknown>
  const vista = await despesaVista(req.scope, req.params.id, corpo.visto)
  if (vista === "mes") {
    res.status(422).json({ erro: "campo", campo: "mes" })
    return
  }
  if (vista === "nao-achou") {
    res.status(404).json({ erro: "nao_achou" })
    return
  }
  const plano = planoDoApagar(vista.despesa, vista.mes)
  await aplicar(req.scope, plano, pedido.membro.id)
  await anotar(pedido, "apagou-despesa", "financeiro", {
    descricao: vista.despesa.descricao,
    no_mes: vista.mes,
    valor: vista.despesa.valor,
    parou: !plano.apagar,
  })
  res.json({ ok: true, parou: !plano.apagar })
}
