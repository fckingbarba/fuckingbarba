import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { gravarValor } from "../../../../lib/financeiro/gravar"
import {
  CHAVE_DO_SIMPLES,
  COMECO_DO_DRE,
  ehMes,
  lerAliquota,
  mesDeAgora,
  somarMeses,
} from "../../../../lib/financeiro/regras"
import { anotar } from "../../../../lib/painel/anotar"

/**
 * POST /dashboard/financeiro/simples — `{ mes, aliquota }`: a alíquota efetiva
 * do Simples Nacional do mês ("6,54"), a do extrato do PGDAS-D que o contador
 * manda. Vazio tira a do mês (o DRE volta a usar a do último mês que tem).
 *
 * RESPOSTAS: 200 `{ ok, mes, aliquota }`; 422 `{ erro: "campo", campo }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const corpo = (req.body ?? {}) as Record<string, unknown>
  const ultimo = somarMeses(mesDeAgora(new Date()), 1)
  if (!ehMes(corpo.mes) || corpo.mes < COMECO_DO_DRE || corpo.mes > ultimo) {
    res.status(422).json({ erro: "campo", campo: "mes" })
    return
  }
  const aliquota = lerAliquota(corpo.aliquota)
  if (aliquota === "invalido") {
    res.status(422).json({ erro: "campo", campo: "aliquota" })
    return
  }
  const r = await gravarValor(req.scope, CHAVE_DO_SIMPLES, `${corpo.mes}-01`, aliquota)
  if (r !== "nada")
    await anotar(pedido, "mudou-simples", "financeiro", { mes: corpo.mes, aliquota })
  res.json({ ok: true, mes: corpo.mes, aliquota: aliquota === null ? null : aliquota / 100 })
}
