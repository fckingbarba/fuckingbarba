import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { FINANCEIRO } from "../../modules/financeiro"
import type FinanceiroService from "../../modules/financeiro/service"
import { produtosComSku } from "../painel/ler"
import type { DespesaGravada } from "./despesas"
import { despesasNosMeses } from "./despesas"
import {
  mapaDosSkus,
  vendaDaLoja,
  vendaDaNuvemshop,
  type DadosDoDre,
  type PedidoDoDre,
  type VendaDoDre,
} from "./dre"
import {
  CHAVE_DA_EMBALAGEM,
  CHAVE_DA_TAXA_DO_PIX,
  CHAVE_DO_SIMPLES,
  janelaDoMes,
  mesesEntre,
  porChave,
} from "./regras"

/**
 * O QUE O FINANCEIRO LÊ DO BANCO — os pedidos da loja nova, os da Nuvemshop
 * (do CRM), os produtos (pelo SKU), as despesas e os valores. A conta é do
 * `dre.ts`; aqui só se lê.
 */

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Quantos dias antes do período se leem os pedidos: o pedido é feito antes
 * de ser pago (o cartão em análise), e o estorno de um pedido velho cai no
 * mês em que saiu.
 */
const DIAS_ANTES = 90

/** O que o DRE lê de cada pedido: os preços, os ajustes, o frete, o pagamento e os estornos. */
const CAMPOS_DO_DRE = [
  "id",
  "status",
  "created_at",
  "total",
  "credit_line_total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.product_id",
  "items.quantity",
  "items.unit_price",
  "items.adjustments.code",
  "items.adjustments.amount",
  "shipping_methods.amount",
  "shipping_methods.adjustments.code",
  "shipping_methods.adjustments.amount",
  "shipping_methods.data",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
  "payment_collections.payment_sessions.data",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.refunds.amount",
  "payment_collections.payments.refunds.created_at",
]

/** Os pedidos da loja nova feitos de `desde` até `ate`. */
export async function pedidosDoFinanceiro(
  container: MedusaContainer,
  desde: Date,
  ate: Date
): Promise<PedidoDoDre[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: CAMPOS_DO_DRE,
    filters: { is_draft_order: false, created_at: { $gte: desde, $lt: ate } },
    pagination: { take: 20_000, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoDoDre[]
}

/** As despesas e os valores do módulo, como o DRE usa. */
export async function doFinanceiro(container: MedusaContainer) {
  const fin = container.resolve<FinanceiroService>(FINANCEIRO)
  const [despesas, valores, custos] = await Promise.all([
    fin.listDespesas({}, { take: 10_000, order: { mes: "ASC", created_at: "ASC" } }),
    fin.listValores({}, { take: 10_000, order: { desde: "ASC" } }),
    fin.listCustosDosPedidos({}, { take: 50_000, select: ["pedido_id", "taxa", "frete"] }),
  ])
  return {
    despesas: despesas.map((d): DespesaGravada => ({
      id: d.id,
      descricao: d.descricao,
      categoria: d.categoria,
      valor: Number(d.valor),
      mes: d.mes,
      repete: Boolean(d.repete),
      ate: d.ate ?? null,
    })),
    valores: porChave(
      valores.map((v) => ({ chave: v.chave, desde: v.desde, valor: Number(v.valor) }))
    ),
    /** O que o job guardou de cada pedido: a taxa e o frete cotado depois (centavos). */
    custos: new Map(
      custos.map((c) => [
        c.pedido_id,
        {
          taxa: c.taxa === null || c.taxa === undefined ? null : Number(c.taxa),
          frete: c.frete === null || c.frete === undefined ? null : Number(c.frete),
        },
      ])
    ),
  }
}

/**
 * Tudo que o DRE precisa pros meses de `de` a `ate`: as vendas das duas
 * lojas, as despesas de cada mês e os valores (o custo de cada produto, a
 * embalagem, o Simples).
 */
export async function dadosDoDre(
  container: MedusaContainer,
  de: string,
  ate: string
): Promise<DadosDoDre> {
  const inicio = janelaDoMes(de).de
  const fim = janelaDoMes(ate).ate
  const crm = container.resolve<CrmService>(CRM)
  const [pedidos, daBase, produtos, fin] = await Promise.all([
    pedidosDoFinanceiro(container, new Date(inicio.getTime() - DIAS_ANTES * DIA_MS), fim),
    crm.pedidosDaBaseDoFinanceiro(inicio, fim),
    produtosComSku(container),
    doFinanceiro(container),
  ])
  const doSku = mapaDosSkus(produtos)
  const vendas: VendaDoDre[] = [
    ...pedidos.flatMap((o) => vendaDaLoja(o, fin.custos.get(o.id)) ?? []),
    ...daBase.flatMap((o) => vendaDaNuvemshop(o, doSku) ?? []),
  ]
  const custos = new Map<string, { desde: string; valor: number }[]>()
  for (const [chave, lista] of fin.valores)
    if (chave.startsWith("custo:")) custos.set(chave.slice("custo:".length), lista)
  return {
    vendas,
    despesas: despesasNosMeses(fin.despesas, mesesEntre(de, ate)),
    custos,
    embalagem: fin.valores.get(CHAVE_DA_EMBALAGEM) ?? [],
    simples: fin.valores.get(CHAVE_DO_SIMPLES) ?? [],
    taxaDoPix: fin.valores.get(CHAVE_DA_TAXA_DO_PIX) ?? [],
  }
}
