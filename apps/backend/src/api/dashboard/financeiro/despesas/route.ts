import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { doFinanceiro } from "../../../../lib/financeiro/ler"
import { lerDespesa } from "../../../../lib/financeiro/regras"
import { mesDasDespesas, telaDasDespesas } from "../../../../lib/financeiro/tela-das-despesas"
import { anotar } from "../../../../lib/painel/anotar"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"
import { FINANCEIRO } from "../../../../modules/financeiro"
import type FinanceiroService from "../../../../modules/financeiro/service"

/**
 * GET /dashboard/financeiro/despesas?mes=2026-09 — as despesas lançadas que
 * entram no mês (as que repetem também), por categoria; os meses pra ir e
 * voltar; e, antes da loja nova, que mês já tem a taxa e o frete da
 * Nuvemshop (`lib/financeiro/tela-das-despesas.ts`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const agora = new Date()
  const mes = mesDasDespesas(req.query.mes, agora)
  const [{ despesas }, meses] = await Promise.all([
    doFinanceiro(req.scope),
    req.scope.resolve<CrmService>(CRM).mesesComVendaNaBase(),
  ])
  res.json(telaDasDespesas(despesas, mes, agora, meses))
}

/**
 * POST /dashboard/financeiro/despesas — `{ descricao, categoria, valor, mes,
 * repete }`: lança uma despesa. O valor em reais ("9.800,00"); o mês o da
 * competência; `repete` entra todo mês dali em diante, até alguém parar.
 *
 * RESPOSTAS: 200 `{ ok, id }`; 422 `{ erro: "campo", campo }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "financeiro")) return

  const lida = lerDespesa(req.body, new Date())
  if (!lida.ok) {
    res.status(422).json({ erro: "campo", campo: lida.campo })
    return
  }
  const d = lida.despesa
  const [criada] = await req.scope
    .resolve<FinanceiroService>(FINANCEIRO)
    .createDespesas([{ ...d, ate: null, lancada_por: pedido.membro.id }])
  await anotar(pedido, "lancou-despesa", "financeiro", {
    descricao: d.descricao,
    categoria: d.categoria,
    valor: d.valor,
    mes: d.mes,
    repete: d.repete,
  })
  res.json({ ok: true, id: criada.id })
}
