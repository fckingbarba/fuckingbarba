import type { Data } from "./formato"
import {
  dentro,
  meiaNoite,
  somaNa,
  somarDias,
  variacao,
  vendasDos,
  type Janela,
  type Venda,
} from "./marketing"
import { passosDo, type Passo } from "./marketing-funil"
import { nomeCurto, type LinhaDaLista, type PedidoCru } from "./pedido"
import { baldeDoInstante, baldesDo, type Comparado, type Periodo } from "./periodo"

/**
 * O INÍCIO NO PERÍODO (entrega 0186) — a parte do Início que muda com a
 * barra de cima: as vendas, a receita e o ticket contra o período de antes, o
 * gráfico de cada um, os mais vendidos, o checkout passo a passo e os pedidos
 * do período. As visitas (do Google) vêm à parte: `visitas-do-periodo.ts`.
 *
 * Código puro, com testes (`__tests__/inicio-periodo.unit.spec.ts`); quem lê
 * o banco é a rota (`api/dashboard/inicio`).
 *
 * "VENDA" É PEDIDO PAGO, a regra do Início e do Marketing (`vendasDos`): Pix
 * esperando e cartão em análise ficam de fora, e o pago depois cancelado
 * também. Conta no instante em que o dinheiro entrou, com o frete.
 *
 * ┌─ AS DUAS LOJAS ────────────────────────────────────────────────────────┐
 * │ A loja nova está no ar desde a virada (27/09/2026). Antes dela, as     │
 * │ vendas são as da Nuvemshop que o CRM guardou (`crm_base_pedido`, o     │
 * │ arquivo de vendas importado em CRM → Base da Nuvemshop): o "confirmado"│
 * │ de lá é o pago daqui, no dia do pagamento (sem ele, no do pedido). Um  │
 * │ pedido nunca está nas duas — a numeração da loja nova começa depois da │
 * │ última da Nuvemshop —, então as duas se somam sem conta dupla. O       │
 * │ produto de um item da Nuvemshop é o de hoje, pelo SKU (o código do     │
 * │ Bling, o mesmo nas duas lojas — a regra dos mais vendidos da home).    │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/** Uma barra do gráfico: as vendas no balde, e as do de antes no mesmo balde. */
export type BarraDoPeriodo = {
  rotulo: string
  nome: string
  agora: boolean
  pedidos: number
  receita: number
  /** `null` sem comparar. */
  antes: { pedidos: number; receita: number } | null
}

/** O que o painel precisa saber do período pra desenhar a barra e as frases. */
export type PeriodoNaTela = Pick<
  Periodo,
  "atalho" | "de" | "ate" | "ateAgora" | "passo" | "nome" | "datas" | "nomeDoAntes" | "aviso"
> & {
  comparar: boolean
  /** Os dias do de antes; `null` sem comparar. */
  antesDe: string | null
  antesAte: string | null
}

export type VendidoNoPeriodo = { nome: string; imagem: string | null; unidades: number }

export type InicioNoPeriodo = {
  periodo: PeriodoNaTela
  vendas: Comparado
  receita: Comparado
  ticket: Comparado
  barras: BarraDoPeriodo[]
  maisVendidos: VendidoNoPeriodo[]
  /** Quantas das vendas do período vieram da Nuvemshop (0: nenhuma — a nota do "?" some). */
  daNuvemshop: number
  /** O checkout passo a passo — só pra quem abre o Marketing. */
  checkout: Passo[] | null
  /** O mesmo checkout no período de antes (a taxa "checkouts que viraram venda" compara); `null` sem comparar. */
  checkoutAntes: Passo[] | null
  /** Os pedidos feitos no período (os mais novos) e quantos são — só pra quem abre os Pedidos. */
  pedidos: { lista: LinhaDaLista[]; total: number } | null
}

const centavos = (v: number) => Math.round(v * 100) / 100
const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export const periodoNaTela = (p: Periodo): PeriodoNaTela => ({
  atalho: p.atalho,
  de: p.de,
  ate: p.ate,
  ateAgora: p.ateAgora,
  passo: p.passo,
  nome: p.nome,
  datas: p.datas,
  nomeDoAntes: p.nomeDoAntes,
  aviso: p.aviso,
  comparar: p.antes !== null,
  antesDe: p.antes?.de ?? null,
  antesAte: p.antes?.ate ?? null,
})

/* ── as vendas da Nuvemshop ───────────────────────────────────────────────── */

/** Um pedido PAGO da loja antiga, como o CRM guarda (o total em centavos). */
export type PedidoDaNuvemshop = {
  numero: string
  pagoEm: Data | null
  feitoEm: Data
  total: number
  /** `[{ sku, nome, quantidade, valor }]`, o valor em reais (`crm/nuvemshop.ts`). */
  itens: unknown
}

/** Um produto de hoje, com o SKU de cada variação: o item da Nuvemshop vira ele. */
export type ProdutoComSku = {
  id: string
  titulo: string
  imagem: string | null
  skus: readonly (string | null | undefined)[]
}

const chaveDoSku = (sku: unknown) => (typeof sku === "string" ? sku.trim().toUpperCase() : "")

/**
 * Os pedidos da Nuvemshop como vendas, no formato das da loja nova
 * (`Venda`): o produto de cada item é o de hoje, pelo SKU; sem SKU que case,
 * o item fica com o nome que veio no arquivo.
 */
export function vendasDaNuvemshop(
  pedidos: readonly PedidoDaNuvemshop[],
  produtos: readonly ProdutoComSku[]
): Venda[] {
  const doSku = new Map<string, ProdutoComSku>()
  for (const p of produtos)
    for (const sku of p.skus) {
      const chave = chaveDoSku(sku)
      if (chave && !doSku.has(chave)) doSku.set(chave, p)
    }
  return pedidos.flatMap((o) => {
    const pagoEm = new Date(o.pagoEm ?? o.feitoEm)
    if (!Number.isFinite(pagoEm.getTime())) return []
    const itens = (Array.isArray(o.itens) ? (o.itens as unknown[]) : []).flatMap((bruto) => {
      const i = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : null
      const unidades = Math.floor(numero(i?.quantidade))
      if (!i || unidades <= 0) return []
      const produto = doSku.get(chaveDoSku(i.sku))
      const nome = produto?.titulo ?? (texto(i.nome) || texto(i.sku) || "Produto")
      return [
        {
          produto: produto?.id ?? `sku:${chaveDoSku(i.sku) || nome}`,
          handle: null,
          nome: nomeCurto(nome),
          imagem: produto?.imagem ?? null,
          unidades,
          receita: centavos(numero(i.valor) * unidades),
          ajustes: [],
        },
      ]
    })
    return [{ id: `nuvemshop:${o.numero}`, pagoEm, total: centavos(numero(o.total) / 100), itens }]
  })
}

/* ── os números, o gráfico e os mais vendidos ─────────────────────────────── */

const comparar = (valor: number, antes: number | null): Comparado => ({
  valor,
  antes,
  variacao: antes === null ? null : variacao(valor, antes),
})

const ticketDe = (s: { receita: number; pedidos: number }) =>
  s.pedidos ? centavos(s.receita / s.pedidos) : 0

/**
 * As barras do período, e as do de antes nos mesmos baldes. O de antes do
 * gráfico é o DIA INTEIRO (o tracejado mostra o resto do dia de ontem), e o
 * número de cima para na mesma hora (`antes.janela`).
 */
export function barrasDo(p: Periodo, vendas: readonly Venda[], agora: Date): BarraDoPeriodo[] {
  const barras: BarraDoPeriodo[] = baldesDo(p, agora).map((b) => ({
    ...b,
    pedidos: 0,
    receita: 0,
    antes: p.antes ? { pedidos: 0, receita: 0 } : null,
  }))
  // Do começo do primeiro dia de antes até o fim do último.
  const diasDeAntes: Janela | null = p.antes
    ? { de: p.antes.janela.de, ate: meiaNoite(somarDias(p.antes.ate, 1)) }
    : null
  for (const v of vendas) {
    if (dentro(v.pagoEm, p.atual)) {
      const b = barras[baldeDoInstante(p, v.pagoEm)]
      if (b) {
        b.pedidos++
        b.receita = centavos(b.receita + v.total)
      }
    } else if (diasDeAntes && dentro(v.pagoEm, diasDeAntes)) {
      const b = barras[baldeDoInstante(p, v.pagoEm, true)]
      if (b?.antes) {
        b.antes.pedidos++
        b.antes.receita = centavos(b.antes.receita + v.total)
      }
    }
  }
  return barras
}

/** Os que mais venderam no período, em unidades (a regra do Início); no empate, os de mais pedidos. */
export function maisVendidosNoPeriodo(
  vendas: readonly Venda[],
  j: Janela,
  maximo = 5
): VendidoNoPeriodo[] {
  const soma = new Map<string, VendidoNoPeriodo & { pedidos: number }>()
  for (const v of vendas) {
    if (!dentro(v.pagoEm, j)) continue
    const doPedido = new Set<string>()
    for (const i of v.itens) {
      const atual = soma.get(i.produto) ?? { nome: i.nome, imagem: null, unidades: 0, pedidos: 0 }
      atual.unidades += i.unidades
      atual.imagem ??= i.imagem
      if (!doPedido.has(i.produto)) atual.pedidos++
      doPedido.add(i.produto)
      soma.set(i.produto, atual)
    }
  }
  return [...soma.values()]
    .filter((s) => s.unidades > 0)
    .sort(
      (a, b) => b.unidades - a.unidades || b.pedidos - a.pedidos || a.nome.localeCompare(b.nome)
    )
    .slice(0, maximo)
    .map(({ nome, imagem, unidades }) => ({ nome, imagem, unidades }))
}

/* ── o checkout ───────────────────────────────────────────────────────────── */

/**
 * A marca que a loja põe no carrinho quando o checkout abre (a hora da
 * primeira vez): `POST /store/checkout/aberto`, logo que a tela do checkout
 * aparece. É o "começaram o checkout" de todo mundo — com cookie ou sem.
 */
export const MARCA_DO_CHECKOUT = "fb_checkout_em"

export type CarrinhoDoCheckout = {
  id: string
  created_at: Data
  email?: string | null
  completed_at?: Data | null
  metadata?: Record<string, unknown> | null
  items?: ({ id?: string | null } | null)[] | null
  billing_address?: { metadata?: Record<string, unknown> | null } | null
  shipping_address?: {
    postal_code?: string | null
    address_1?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  shipping_methods?: ({ id?: string | null } | null)[] | null
  order?: { id?: string | null } | null
}

/**
 * Até onde o carrinho foi: 0 nem abriu o checkout; 1 abriu; 2 passou do
 * contato (o e-mail e o documento, o primeiro passo); 3 passou da entrega (o
 * endereço e o frete); 4 virou pedido; 5 o pedido foi pago. As regras dos
 * passos são as da loja (`etapaDoCarrinho`) e as dos carrinhos do painel
 * (`ondeParou`, em `carrinhos.ts`).
 *
 * "ABRIU" é a marca da loja; o carrinho de antes da marca (0186) conta pelo
 * e-mail — é o que o checkout pede primeiro.
 */
export function ateOndeFoi(c: CarrinhoDoCheckout, pagos: ReadonlySet<string>): number {
  if (c.order?.id && pagos.has(c.order.id)) return 5
  if (c.completed_at) return 4
  const documento = c.billing_address?.metadata?.documento as { valor?: unknown } | undefined
  const contato = Boolean(texto(c.email) && texto(documento?.valor))
  const e = c.shipping_address
  const meta = e?.metadata ?? {}
  const endereco = Boolean(
    texto(e?.postal_code) && texto(meta.rua ?? e?.address_1) && texto(meta.numero)
  )
  if (contato && endereco && (c.shipping_methods ?? []).some(Boolean)) return 3
  if (contato) return 2
  if (texto(c.metadata?.[MARCA_DO_CHECKOUT]) || texto(c.email)) return 1
  return 0
}

/**
 * O checkout passo a passo, pelos carrinhos criados no período (com produto):
 * quantos chegaram em cada passo (quem chegou num, passou pelos de antes) e a
 * maior perda (`passosDo`, a do Funil do Marketing). `pagos`: os pedidos pagos.
 */
export function checkoutDoPeriodo(
  carrinhos: readonly CarrinhoDoCheckout[],
  pagos: ReadonlySet<string>,
  j: Janela
): Passo[] {
  const ate = carrinhos
    .filter((c) => dentro(new Date(c.created_at), j) && (c.items ?? []).some(Boolean))
    .map((c) => ateOndeFoi(c, pagos))
  const chegaram = (n: number) => ate.filter((k) => k >= n).length
  return passosDo([
    { nome: "Começaram o checkout", n: chegaram(1) },
    { nome: "Chegaram na entrega", n: chegaram(2) },
    { nome: "Chegaram no pagamento", n: chegaram(3) },
    { nome: "Fizeram o pedido", n: chegaram(4) },
    { nome: "Pagaram", n: chegaram(5) },
  ])
}

/* ── o Início no período ──────────────────────────────────────────────────── */

export type DadosDoPeriodo = {
  /** Os pedidos da loja nova desde antes do período (com o total), pras vendas. */
  pedidos: PedidoCru[]
  /** As vendas da Nuvemshop no período e no de antes. */
  daNuvemshop: PedidoDaNuvemshop[]
  produtos: ProdutoComSku[]
  /** Os carrinhos do período e do de antes — `null` pra quem não abre o Marketing. */
  carrinhos: CarrinhoDoCheckout[] | null
  /** Os pedidos feitos no período, já prontos pra lista — `null` pra quem não abre os Pedidos. */
  feitos: { lista: LinhaDaLista[]; total: number } | null
}

export function montarInicioNoPeriodo(
  p: Periodo,
  dados: DadosDoPeriodo,
  agora: Date
): InicioNoPeriodo {
  const daLojaNova = vendasDos(dados.pedidos)
  const daNuvemshop = vendasDaNuvemshop(dados.daNuvemshop, dados.produtos)
  const vendas = [...daLojaNova, ...daNuvemshop]
  const atual = somaNa(vendas, p.atual)
  const antes = p.antes ? somaNa(vendas, p.antes.janela) : null
  const pagos = new Set(daLojaNova.map((v) => v.id))
  return {
    periodo: periodoNaTela(p),
    vendas: comparar(atual.pedidos, antes?.pedidos ?? null),
    receita: comparar(atual.receita, antes?.receita ?? null),
    ticket: comparar(ticketDe(atual), antes ? ticketDe(antes) : null),
    barras: barrasDo(p, vendas, agora),
    maisVendidos: maisVendidosNoPeriodo(vendas, p.atual),
    daNuvemshop: daNuvemshop.filter((v) => dentro(v.pagoEm, p.atual)).length,
    checkout: dados.carrinhos ? checkoutDoPeriodo(dados.carrinhos, pagos, p.atual) : null,
    checkoutAntes:
      dados.carrinhos && p.antes ? checkoutDoPeriodo(dados.carrinhos, pagos, p.antes.janela) : null,
    pedidos: dados.feitos,
  }
}
