import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { ehKitDeQuantidade } from "../../../lib/bumps"
import {
  itensDaBase,
  JANELA_DIAS,
  ordemDosMaisVendidos,
  type PedidoPago,
  type ProdutoVendavel,
} from "../../../lib/mais-vendidos"
import { pagamentoDo, type PedidoCru } from "../../../lib/painel/pedido"
import { daLoja } from "../../../lib/quem-pede"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"

/**
 * GET /store/mais-vendidos — a ordem dos mais vendidos, pra home da loja.
 *
 *   { "handles": ["kit-completo-para-barba", "fator-de-crescimento-para-barba", …] }
 *
 * A conta mora em `lib/mais-vendidos.ts`; aqui só se junta o que ela pede:
 * os produtos publicados (com o SKU de cada variação), os pedidos pagos do
 * Medusa dos últimos 90 dias (pago = com o dinheiro capturado, a regra do
 * painel: `pagamentoDo`) e os da Nuvemshop no mesmo período, da base que o
 * CRM guardou.
 *
 * SÓ A LOJA PERGUNTA (`x-loja-segredo`): a ordem sai dos pedidos, e montar
 * ela lê 90 dias deles. A rota guarda a conta por dez minutos — várias
 * cópias da loja perguntando juntas fazem UMA conta —, e a loja, por uma
 * hora (`maisVendidos`, em `apps/loja/src/lib/medusa.ts`).
 */

const VALE_POR_MS = 10 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000
/** Teto de pedidos do Medusa lidos. Noventa dias de loja pequena cabem folgado. */
const MAX_PEDIDOS = 10_000

let guardado: { em: number; handles: string[] } | null = null
let calculando: Promise<string[]> | null = null

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  res.json({ handles: await ordemAtual(req.scope) })
}

async function ordemAtual(container: MedusaContainer): Promise<string[]> {
  if (guardado && Date.now() - guardado.em < VALE_POR_MS) return guardado.handles
  calculando ??= calcular(container)
    .then((handles) => {
      guardado = { em: Date.now(), handles }
      return handles
    })
    .finally(() => {
      calculando = null
    })
  return calculando
}

async function calcular(container: MedusaContainer): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const desde = new Date(Date.now() - JANELA_DIAS * DIA_MS)

  const [{ data: brutos }, { data: pedidos }, daBase] = await Promise.all([
    query.graph({
      entity: "product",
      fields: ["handle", "metadata", "variants.sku"],
      filters: { status: ProductStatus.PUBLISHED },
    }),
    query.graph({
      entity: "order",
      fields: [
        "status",
        "items.product_handle",
        "items.variant_sku",
        "items.quantity",
        "payment_collections.payments.captured_at",
      ],
      filters: { is_draft_order: false, created_at: { $gte: desde } },
      pagination: { take: MAX_PEDIDOS, order: { created_at: "DESC" } },
    }),
    container.resolve<CrmService>(CRM).vendidosDaBase(desde),
  ])

  const produtos: ProdutoVendavel[] = brutos.flatMap((p) =>
    p.handle && !ehKitDeQuantidade(p.metadata)
      ? [{ handle: p.handle, skus: (p.variants ?? []).map((v) => v?.sku) }]
      : []
  )
  const pagos: PedidoPago[] = [
    ...(pedidos as unknown as PedidoCru[]).flatMap((o) =>
      o.status === "canceled" || !pagamentoDo(o).pagoEm
        ? []
        : [
            {
              itens: (o.items ?? []).map((i) => ({
                sku: i.variant_sku,
                handle: i.product_handle,
                unidades: Number(i.quantity ?? 0),
              })),
            },
          ]
    ),
    ...daBase.map((p) => ({ itens: itensDaBase(p.itens) })),
  ]
  return ordemDosMaisVendidos(produtos, pagos)
}
