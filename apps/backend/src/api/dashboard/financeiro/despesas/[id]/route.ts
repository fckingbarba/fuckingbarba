import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { planoDaMudanca } from "../../../../../lib/financeiro/despesas"
import { aplicar, despesaVista } from "../../../../../lib/financeiro/gravar"
import { lerDespesa } from "../../../../../lib/financeiro/regras"
import { anotar } from "../../../../../lib/painel/anotar"

/**
 * POST /dashboard/financeiro/despesas/:id — `{ visto, descricao, categoria,
 * valor, mes, repete }`: muda a despesa que a pessoa via no mês `visto`. A
 * de um mês só muda inteira (e pode ir pra outro mês). A que repete, vista
 * num mês depois do primeiro, fecha no mês de antes e continua com o valor
 * novo dali em diante — os meses de antes não mudam (`planoDaMudanca`).
 *
 * RESPOSTAS: 200 `{ ok }`; 404 `{ erro: "nao_achou" }` (apagada, ou fora do
 * mês visto); 422 `{ erro: "campo", campo }`.
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
  const lida = lerDespesa({ ...corpo, mes: corpo.mes ?? vista.mes }, new Date())
  if (!lida.ok) {
    res.status(422).json({ erro: "campo", campo: lida.campo })
    return
  }
  const plano = planoDaMudanca(vista.despesa, vista.mes, lida.despesa)
  await aplicar(req.scope, plano, pedido.membro.id)
  await anotar(pedido, "mudou-despesa", "financeiro", {
    descricao: lida.despesa.descricao,
    no_mes: vista.mes,
    de: vista.despesa.valor,
    para: lida.despesa.valor,
  })
  res.json({ ok: true })
}
