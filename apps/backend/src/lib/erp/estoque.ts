import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ERP } from "../../modules/erp"
import type ErpService from "../../modules/erp/service"
import { avisarALoja } from "../revalidar"
import { acessoAoErp, atualizarConexao } from "./conexao"
import type { ErpDaLoja } from "./contrato"
import { erpDaLoja } from "./erps"

/**
 * O ESTOQUE ESPELHA O ERP — o ERP manda (decidido em 23/09): entrada,
 * produção e perda são lançadas nele, e a loja copia.
 *
 * ┌─ A CONTA, SEM DESCONTAR DUAS VEZES ────────────────────────────────────┐
 * │ O ERP diz quanto dá pra vender: a prateleira menos o que ELE reservou  │
 * │ pros pedidos que já tem. O Medusa reserva cada pedido na hora da       │
 * │ compra — inclusive o Pix que ainda não caiu, que o ERP nem conhece.    │
 * │ Copiar o número do ERP direto descontaria duas vezes o pedido pago     │
 * │ que já foi pra lá. Então:                                              │
 * │                                                                        │
 * │   estoque no Medusa = saldo do ERP                                     │
 * │                     + o que o Medusa reservou pros pedidos que JÁ      │
 * │                       estão no ERP                                     │
 * │                                                                        │
 * │ e o que sobra pra vender (estoque − reservas do Medusa) é o saldo do   │
 * │ ERP menos só as reservas dos pedidos que o ERP ainda não conhece.      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * QUEM CHAMA: o job `sincronizar-estoque` (de 5 em 5 minutos), o aviso de
 * estoque do ERP (`/hooks/erp/<id>`, alguns segundos depois de chegar), e
 * `POST /admin/erp/estoque`.
 *
 * SKU QUE O ERP NÃO CONHECE NÃO É MEXIDO: melhor o número de antes do que
 * zerar um produto por causa de um cadastro faltando — e o relatório (na
 * tela do ERP, no admin) diz qual. Só entram os produtos PUBLICADOS: o
 * rascunho não está à venda (os kits de quantidade aposentados, FBFCB01-K2
 * e -K3, estão lá, e o Bling nunca teve esses códigos).
 */

export type RelatorioDoEstoque = {
  em: string
  erp: string
  ok: boolean
  motivo?: string
  /** Quantos SKUs foram conferidos com o ERP. */
  conferidos: number
  mudaram: { sku: string; de: number; para: number }[]
  /** SKUs da loja que o ERP não tem (ou tem inativos). */
  naoAchados: string[]
  /** Variações com controle de estoque e sem SKU: não há como achar no ERP. */
  semSku: string[]
}

type Variacao = {
  id: string
  sku?: string | null
  title?: string | null
  manage_inventory?: boolean | null
  product?: { handle?: string | null; title?: string | null; status?: string | null } | null
  inventory_items?:
    ({ inventory_item_id?: string | null; required_quantity?: number | null } | null)[] | null
}

/**
 * A conta do estoque de cada item, sem efeito nenhum: o saldo do ERP mais o
 * que o Medusa reservou pros pedidos que o ERP já conhece. Nunca negativo.
 */
export function estoqueEspelhado(saldoNoErp: number, reservadoNoErp: number): number {
  return Math.max(0, Math.floor(saldoNoErp) + Math.max(0, reservadoNoErp))
}

/** Quanto o Medusa reservou, por item de estoque, pros pedidos que já estão no ERP. */
async function reservadoPelosPedidosNoErp(
  container: MedusaContainer,
  erp: ErpDaLoja,
  itens: string[],
  agora: Date
): Promise<Map<string, number>> {
  const soma = new Map<string, number>()
  const reservas = await container
    .resolve(Modules.INVENTORY)
    .listReservationItems(
      { inventory_item_id: itens },
      { select: ["inventory_item_id", "line_item_id", "quantity"], take: 5000 }
    )
  const comLinha = reservas.filter((r) => r.line_item_id)
  if (!comLinha.length) return soma

  // Os pedidos que já foram pro ERP: os que têm nota com o pedido criado lá.
  // Reserva é de pedido que ainda não saiu; 60 dias cobrem com folga.
  const notas = await container
    .resolve<ErpService>(ERP)
    .listNotas(
      { erp: erp.id, created_at: { $gte: new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000) } },
      { select: ["pedido_id", "no_erp", "situacao"], take: 5000 }
    )
  const pedidos = notas
    .filter(
      (n) =>
        n.situacao !== "desfeita" && erp.pedidoNoErp((n.no_erp ?? {}) as Record<string, unknown>)
    )
    .map((n) => n.pedido_id)
  if (!pedidos.length) return soma

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "items.id"],
    filters: { id: pedidos },
  })
  const linhasNoErp = new Set(
    (data as { items?: ({ id?: string } | null)[] | null }[]).flatMap((o) =>
      (o.items ?? []).flatMap((i) => (i?.id ? [i.id] : []))
    )
  )
  for (const r of comLinha) {
    if (!linhasNoErp.has(r.line_item_id as string)) continue
    soma.set(r.inventory_item_id, (soma.get(r.inventory_item_id) ?? 0) + Number(r.quantity ?? 0))
  }
  return soma
}

export async function sincronizarEstoque(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDoEstoque | null> {
  const erp = erpDaLoja()
  if (!erp) return null
  const acesso = await acessoAoErp(container, erp)
  if (!acesso) return null
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return container.resolve(Modules.LOCKING).execute(
    `erp-estoque:${erp.id}`,
    async (): Promise<RelatorioDoEstoque> => {
      const relatorio: RelatorioDoEstoque = {
        em: agora.toISOString(),
        erp: erp.id,
        ok: true,
        conferidos: 0,
        mudaram: [],
        naoAchados: [],
        semSku: [],
      }
      const guardar = async () => {
        await atualizarConexao(container, erp, {
          estoque: relatorio as unknown as Record<string, unknown>,
        })
        return relatorio
      }

      /* As variações que controlam estoque, cada uma com o item dela. */
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: [
          "id",
          "sku",
          "title",
          "manage_inventory",
          "product.handle",
          "product.status",
          "product.title",
          "inventory_items.inventory_item_id",
          "inventory_items.required_quantity",
        ],
      })
      const porItem = new Map<string, { sku: string; handle: string | null }>()
      for (const v of data as Variacao[]) {
        // Só o que está à venda: o rascunho (os kits de quantidade aposentados,
        // um produto em preparo) não tem estoque que importe, e o SKU dele
        // pode nem existir no ERP — viraria um aviso eterno na tela e no log.
        if (!v.manage_inventory || v.product?.status !== "published") continue
        const sku = v.sku?.trim()
        const itens = (v.inventory_items ?? []).filter((i) => i?.inventory_item_id)
        if (!sku) {
          relatorio.semSku.push(`${v.product?.title ?? "?"}${v.title ? ` — ${v.title}` : ""}`)
          continue
        }
        // Variação montada de vários itens de estoque (kit do Medusa) não se
        // espelha por um SKU só: fica como está.
        if (itens.length !== 1 || (itens[0]!.required_quantity ?? 1) !== 1) continue
        porItem.set(itens[0]!.inventory_item_id!, { sku, handle: v.product?.handle ?? null })
      }
      const skus = [...new Set([...porItem.values()].map((p) => p.sku))]
      if (!skus.length) return guardar()

      const leitura = await erp.lerSaldos(acesso, skus)
      if (!leitura.ok) {
        relatorio.ok = false
        relatorio.motivo = leitura.motivo
        logger.warn(`[erp] o estoque não foi lido do ${erp.nome}: ${leitura.motivo}`)
        return guardar()
      }
      const saldo = new Map(leitura.saldos.map((s) => [s.sku, s.saldo]))
      relatorio.naoAchados = leitura.naoAchados
      relatorio.conferidos = saldo.size

      const inventario = container.resolve(Modules.INVENTORY)
      const ids = [...porItem.keys()]
      const niveis = await inventario.listInventoryLevels(
        { inventory_item_id: ids },
        { select: ["id", "inventory_item_id", "location_id", "stocked_quantity"], take: 5000 }
      )
      const reservado = await reservadoPelosPedidosNoErp(container, erp, ids, agora)

      const mudar: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] =
        []
      const produtosQueMudaram = new Set<string>()
      for (const [item, { sku, handle }] of porItem) {
        const noErp = saldo.get(sku)
        if (noErp === undefined) continue
        const nivel = niveis.find((n) => n.inventory_item_id === item)
        if (!nivel) continue
        const para = estoqueEspelhado(noErp, reservado.get(item) ?? 0)
        const de = Number(nivel.stocked_quantity ?? 0)
        if (para === de) continue
        mudar.push({
          inventory_item_id: item,
          location_id: nivel.location_id,
          stocked_quantity: para,
        })
        relatorio.mudaram.push({ sku, de, para })
        if (handle) produtosQueMudaram.add(handle)
      }

      if (mudar.length) {
        await inventario.updateInventoryLevels(mudar)
        logger.info(
          `[erp] estoque do ${erp.nome}: ${relatorio.mudaram.map((m) => `${m.sku} ${m.de}→${m.para}`).join(", ")}`
        )
        await avisarALoja(
          ["produtos", ...[...produtosQueMudaram].map((h) => `produto:${h}`)],
          logger
        )
      }
      if (relatorio.naoAchados.length) {
        logger.warn(
          `[erp] ${relatorio.naoAchados.length} SKU(s) da loja sem produto ativo no ${erp.nome}: ` +
            `${relatorio.naoAchados.join(", ")} — o estoque deles não foi mexido`
        )
      }
      return guardar()
    },
    { timeout: 60 }
  )
}

/* ── o aviso de estoque junta os pedidos de sincronização ─────────────────── */

let agendada: NodeJS.Timeout | null = null

/**
 * O aviso do ERP chega em rajada (um por produto, e o virtual junto do
 * físico). Em vez de sincronizar a cada um, espera 3 segundos e sincroniza
 * uma vez — a sincronização é uma chamada ao ERP pra todos os SKUs.
 */
export function pedirSincronizacao(container: MedusaContainer) {
  if (agendada) return
  agendada = setTimeout(() => {
    agendada = null
    sincronizarEstoque(container).catch((e) =>
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[erp] a sincronização pedida pelo aviso falhou: ${e instanceof Error ? e.message : e}`
        )
    )
  }, 3000)
}
