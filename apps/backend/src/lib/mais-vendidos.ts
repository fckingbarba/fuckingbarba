/**
 * OS MAIS VENDIDOS — a ordem dos produtos da home (o carrossel e a vitrine
 * "Todos os produtos"), do que mais vendeu pro que menos. Pedido da loja em
 * 28/09.
 *
 * A conta junta as duas lojas: os pedidos PAGOS do Medusa (a loja nova, no
 * ar desde a virada de 27/09) e os da Nuvemshop que o CRM guardou
 * (`crm_base_pedido`, o arquivo de vendas importado em CRM → Base da
 * Nuvemshop). Só com a loja nova, a home começaria ordenada por um punhado
 * de pedidos — sorteio, não venda.
 *
 * ┌─ AS REGRAS ────────────────────────────────────────────────────────────┐
 * │ • VENDIDO É PAGO. No Medusa, com o dinheiro capturado e sem cancelar   │
 * │   (a regra do Início e do Marketing do painel — quem aplica é a rota); │
 * │   na Nuvemshop, o "confirmado" (o recusado nunca foi pago, o estornado │
 * │   voltou).                                                             │
 * │ • OS ÚLTIMOS 90 DIAS (`JANELA_DIAS`): o que vende agora, não o que     │
 * │   vendeu no ano passado. Produto novo que vende bem sobe em semanas, e │
 * │   a Nuvemshop sai da conta sozinha no fim de dezembro.                 │
 * │ • EM UNIDADES, como o "Mais vendidos da semana" do Início. No empate,  │
 * │   o que esteve em mais pedidos; depois, o endereço — a ordem não muda  │
 * │   de uma leitura pra outra.                                            │
 * │ • O PRODUTO É O DE HOJE, PELO SKU (o código do Bling, o mesmo nas duas │
 * │   lojas — ver `crm/etiquetas.ts`); sem SKU que case, pelo endereço.    │
 * │   Item de produto que não está publicado não conta.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A RESPOSTA É SÓ A ORDEM: os endereços, sem quantidade nenhuma — quanto a
 * loja vende não é da conta de quem abre o site (a regra do modelo de
 * recomendação). Produto sem venda na janela fica de fora da lista; a loja
 * põe ele depois dos que venderam, na ordem de sempre, e o esgotado no fim
 * de tudo (isso é da loja, que sabe o estoque: `maisVendidosPrimeiro`, em
 * `apps/loja/src/lib/catalogo.ts`).
 *
 * AQUI É SÓ CONTA — sem banco, sem Medusa. Quem lê é a rota
 * (`api/store/mais-vendidos/route.ts`); os testes estão em
 * `__tests__/mais-vendidos.unit.spec.ts`.
 */

/** Quantos dias de venda a conta olha. */
export const JANELA_DIAS = 90

/** Um produto publicado: o endereço e o SKU de cada variação. */
export type ProdutoVendavel = { handle: string; skus: readonly (string | null | undefined)[] }

/** Um item vendido: pelo SKU, pelo endereço do produto (ou os dois) e as unidades. */
export type ItemVendido = { sku?: string | null; handle?: string | null; unidades: number }

/** Um pedido pago, só com os itens. */
export type PedidoPago = { itens: readonly ItemVendido[] }

const chaveDoSku = (sku: string | null | undefined) =>
  typeof sku === "string" ? sku.trim().toUpperCase() : ""

/**
 * Os itens de um pedido da Nuvemshop como o banco guarda
 * (`[{ sku, nome, quantidade, valor }]` — `crm/nuvemshop.ts`), só com o que
 * a conta usa. O que não tem SKU ou quantidade fica de fora: na loja antiga
 * o produto é o SKU.
 */
export function itensDaBase(itens: unknown): ItemVendido[] {
  if (!Array.isArray(itens)) return []
  return itens.flatMap((bruto): ItemVendido[] => {
    const item = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : null
    const unidades = Number(item?.quantidade)
    return item && chaveDoSku(item.sku as string | null) && unidades > 0
      ? [{ sku: item.sku as string, unidades }]
      : []
  })
}

/** Os endereços dos produtos, do que mais vendeu pro que menos; só os que venderam. */
export function ordemDosMaisVendidos(
  produtos: readonly ProdutoVendavel[],
  pedidos: readonly PedidoPago[]
): string[] {
  const publicados = new Set(produtos.map((p) => p.handle))
  const doSku = new Map<string, string>()
  for (const p of produtos)
    for (const sku of p.skus) {
      const chave = chaveDoSku(sku)
      if (chave && !doSku.has(chave)) doSku.set(chave, p.handle)
    }

  const unidades = new Map<string, number>()
  const pedidosCom = new Map<string, number>()
  for (const pedido of pedidos) {
    const doPedido = new Set<string>()
    for (const item of pedido.itens) {
      const handle =
        doSku.get(chaveDoSku(item.sku)) ??
        (item.handle && publicados.has(item.handle) ? item.handle : null)
      const n = Number.isFinite(item.unidades) ? Math.floor(item.unidades) : 0
      if (!handle || n <= 0) continue
      unidades.set(handle, (unidades.get(handle) ?? 0) + n)
      doPedido.add(handle)
    }
    for (const handle of doPedido) pedidosCom.set(handle, (pedidosCom.get(handle) ?? 0) + 1)
  }

  return [...unidades.keys()].sort(
    (a, b) =>
      unidades.get(b)! - unidades.get(a)! ||
      pedidosCom.get(b)! - pedidosCom.get(a)! ||
      a.localeCompare(b)
  )
}
