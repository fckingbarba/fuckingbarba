import type { Acesso, LeituraDeSaldos } from "../../lib/erp/contrato"
import { chamarBling, type Consulta, ErroDoBling } from "./api"

/**
 * OS PRODUTOS DO BLING, PELO SKU.
 *
 * A API v3 é toda pelo id do Bling — o saldo, o aviso de estoque, o item do
 * pedido de venda —, e a loja conhece o SKU (FBOL01, FBKIT01…). A ponte é
 * `GET /produtos?codigos[]=…`, que devolve o id, o código e o saldo que dá
 * pra vender: `estoque.saldoVirtualTotal`, a prateleira menos o que o Bling
 * já reservou pros pedidos dele em aberto.
 *
 * O SKU TEM DE SER IDÊNTICO NOS DOIS LADOS — é a mesma exigência da
 * integração do Bling com a Nuvemshop. Produto que a loja tem e o Bling não
 * (ou tem inativo) fica de fora: o estoque dele não é mexido, e a nota do
 * pedido que o tiver não sai (o Bling precisa do cadastro dele: NCM,
 * tributação).
 *
 * `codigos[]` no plural, sempre — o parâmetro no singular não existe, e
 * parâmetro que o Bling não conhece é ignorado em silêncio.
 */

export type ProdutoDoBling = {
  id: number
  sku: string
  /** `null` quando a lista não trouxe o saldo (aí ele vem de `/estoques/saldos`). */
  saldo: number | null
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** Os produtos da resposta que respondem pelos SKUs pedidos: ativos, com o código idêntico. */
export function lerProdutos(corpo: unknown, skus: readonly string[]): Map<string, ProdutoDoBling> {
  const procurados = new Set(skus)
  const achados = new Map<string, ProdutoDoBling>()
  const itens = (corpo as { data?: unknown } | null)?.data
  for (const bruto of Array.isArray(itens) ? itens : []) {
    const p = bruto as {
      id?: unknown
      codigo?: unknown
      situacao?: unknown
      estoque?: { saldoVirtualTotal?: unknown } | null
    }
    const sku = typeof p.codigo === "string" ? p.codigo.trim() : ""
    const id = numero(p.id)
    if (!sku || !id || !procurados.has(sku) || achados.has(sku)) continue
    if (p.situacao !== undefined && p.situacao !== "A") continue
    achados.set(sku, { id, sku, saldo: numero(p.estoque?.saldoVirtualTotal) })
  }
  return achados
}

/** `GET /estoques/saldos` → id do produto → o que dá pra vender. */
export function lerSaldosDosIds(corpo: unknown): Map<number, number> {
  const saldos = new Map<number, number>()
  const itens = (corpo as { data?: unknown } | null)?.data
  for (const bruto of Array.isArray(itens) ? itens : []) {
    const s = bruto as { produto?: { id?: unknown } | null; saldoVirtualTotal?: unknown }
    const id = numero(s.produto?.id)
    const saldo = numero(s.saldoVirtualTotal)
    if (id && saldo !== null) saldos.set(id, saldo)
  }
  return saldos
}

const emLotes = <T>(lista: readonly T[], tamanho: number) =>
  Array.from({ length: Math.ceil(lista.length / tamanho) }, (_, i) =>
    lista.slice(i * tamanho, (i + 1) * tamanho)
  )

const POR_PAGINA = 100

/**
 * OS TRÊS FILTROS DE SALDO, pra não perder o produto esgotado.
 *
 * A especificação da v3 dá `filtroSaldoEstoque` com padrão 1 — só saldo
 * POSITIVO. Se o Bling aplicar esse padrão quando o parâmetro não vai, a
 * lista esconde o produto zerado: o estoque dele nunca chegaria a zero na
 * loja (vende o que não tem), e a importação o daria por apagado. Não há
 * valor pra "todos", então a loja pergunta pelos três — positivo, zerado,
 * negativo — e junta pelo id. Se o padrão não for aplicado, as três
 * respostas só se repetem; o custo são duas chamadas a mais por leitura.
 */
const FILTROS_DE_SALDO = [1, 0, 2] as const

/** `GET /produtos` com `consulta`, todas as páginas dos três filtros de saldo, sem repetir id. */
export async function listarProdutos(
  acesso: Acesso,
  consulta: Consulta,
  { paginas = 20 }: { paginas?: number } = {}
): Promise<unknown[]> {
  const vistos = new Map<number, unknown>()
  for (const filtroSaldoEstoque of FILTROS_DE_SALDO) {
    for (let pagina = 1; pagina <= paginas; pagina++) {
      const r = await chamarBling<{ data?: unknown[] }>(acesso, "GET", "/produtos", {
        consulta: { ...consulta, filtroSaldoEstoque, pagina, limite: POR_PAGINA },
      })
      const itens = Array.isArray(r.corpo?.data) ? r.corpo.data : []
      for (const item of itens) {
        const id = numero((item as { id?: unknown } | null)?.id)
        if (id && !vistos.has(id)) vistos.set(id, item)
      }
      if (itens.length < POR_PAGINA) break
    }
  }
  return [...vistos.values()]
}

export async function produtosPorSku(
  acesso: Acesso,
  skus: readonly string[]
): Promise<Map<string, ProdutoDoBling>> {
  const achados = new Map<string, ProdutoDoBling>()
  for (const lote of emLotes([...new Set(skus)], 50)) {
    // `criterio` 2: só os ativos.
    const itens = await listarProdutos(acesso, { "codigos[]": lote, criterio: 2 })
    for (const [sku, p] of lerProdutos({ data: itens }, lote))
      if (!achados.has(sku)) achados.set(sku, p)
  }

  const semSaldo = [...achados.values()].filter((p) => p.saldo === null)
  for (const lote of emLotes(semSaldo, 50)) {
    const r = await chamarBling(acesso, "GET", "/estoques/saldos", {
      consulta: { "idsProdutos[]": lote.map((p) => p.id) },
    })
    const saldos = lerSaldosDosIds(r.corpo)
    for (const p of lote) p.saldo = saldos.get(p.id) ?? 0
  }
  return achados
}

export async function lerSaldos(acesso: Acesso, skus: string[]): Promise<LeituraDeSaldos> {
  try {
    const achados = await produtosPorSku(acesso, skus)
    return {
      ok: true,
      saldos: [...achados.values()].map((p) => ({ sku: p.sku, saldo: p.saldo ?? 0 })),
      naoAchados: skus.filter((s) => !achados.has(s)),
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof ErroDoBling ? e.message : String(e) }
  }
}
