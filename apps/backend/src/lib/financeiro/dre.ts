import { PREFIXO_DO_BUMP } from "../bumps"
import { ehCupomDoCrm } from "../crm/fluxos"
import { PREFIXO_DA_PROMOCAO } from "../cupons"
import { chaveDoDia, reais } from "../painel/formato"
import { dentro } from "../painel/periodo"
import { PAGARME } from "../pagamento/parceiros"
import { pagamentoDo, totalDo, type PedidoCru } from "../painel/pedido"
import type { DespesaNoMes } from "./despesas"
import {
  aliquotaDoMes,
  emPorcento,
  janelaDoMes,
  MES_DA_LOJA_NOVA,
  mesCurto,
  mesEAno,
  nomeDoMes,
  vigente,
  type Categoria,
  type Vigencia,
} from "./regras"

/**
 * O DRE DA LOJA — de cada venda até o lucro do mês. Código puro, testado em
 * `__tests__/dre.unit.spec.ts`: recebe as vendas (a loja nova e a
 * Nuvemshop), as despesas lançadas e os valores que valem em cada dia (o
 * custo de cada produto, a embalagem, o Simples) e devolve as linhas, já com
 * o nome, a origem e o que falta. Quem lê do banco é a rota.
 *
 *   Receita bruta          os produtos pelo preço cobrado antes dos cupons, e o frete cobrado
 *   (−) Deduções           descontos e cupons · cancelamentos e estornos · Simples Nacional
 *   = Receita líquida
 *   (−) Custo dos produtos custo × unidades (o que valia no dia da venda) · embalagem por pedido
 *   = Lucro bruto
 *   (−) Despesas variáveis taxas de pagamento · frete pago pela loja · comissões
 *   = Margem de contribuição
 *   (−) Despesas fixas     marketing · plataforma · pessoal · contador · outras
 *   = Resultado operacional
 *   Resultado financeiro   tarifas, juros e IOF
 *   = Lucro líquido
 *
 * ┌─ AS REGRAS DA CONTA ───────────────────────────────────────────────────┐
 * │ • A venda conta no MÊS DO PAGAMENTO (a primeira captura), como no      │
 * │   Início; o estorno, no mês em que saiu.                               │
 * │ • O pedido cancelado depois de pago ENTRA na receita e sai inteiro nos │
 * │   estornos — é o que aconteceu com o dinheiro. Sem custo e sem          │
 * │   embalagem: o produto não saiu. Estorno parcial não mexe no custo.    │
 * │ • Os descontos fecham com o cobrado: produtos + frete − cobrado. Os    │
 * │   ajustes do Medusa dizem de onde veio cada um; os centavos que o      │
 * │   Pagar.me arredonda viram a linha "Centavos do arredondamento".       │
 * │ • O Simples é a alíquota do mês sobre a venda menos descontos e        │
 * │   estornos. Sem a do mês, a do último mês que tem — e o DRE avisa.     │
 * │ • Todo número incompleto diz que é: a etiqueta da linha (`falta`) e a  │
 * │   lista "Pra fechar certinho" (`pendencias`).                          │
 * │ • Dinheiro em reais, arredondado em centavos a cada linha.             │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const arred = (v: number) => Math.round(v * 100) / 100
const numero = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const soma = (vs: readonly number[]) => arred(vs.reduce((s, v) => s + v, 0))
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "a, b e c" */
const juntar = (itens: string[]) =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`

/**
 * O nome do produto no detalhe do custo: o título inteiro (o curto das listas
 * junta os kits — "Kit Fator — 3 meses" e "— 6 meses" viram "Kit Fator").
 */
const nomeDoItem = (v: string | null | undefined) =>
  (v ?? "").replace(/\s+/g, " ").trim() || "Produto"

/** O mês com a primeira maiúscula: "Setembro". */
const Mes = (mes: string) => `${nomeDoMes(mes)[0].toUpperCase()}${nomeDoMes(mes).slice(1)}`

/* ── as vendas ────────────────────────────────────────────────────────────── */

export type Origem = "loja" | "nuvemshop"

export type TipoDeDesconto = "promocao" | "oferta" | "crm" | "cupom" | "nuvemshop" | "centavos"

const NOME_DO_DESCONTO: Record<TipoDeDesconto, string> = {
  promocao: "Leve X, pague Y",
  oferta: "Oferta do checkout",
  crm: "Cupons do CRM (volta, boas-vindas, indique)",
  cupom: "Outros cupons",
  nuvemshop: "Descontos na Nuvemshop",
  centavos: "Centavos do arredondamento",
}
const ORDEM_DOS_DESCONTOS = Object.keys(NOME_DO_DESCONTO) as TipoDeDesconto[]

/** De onde veio o desconto, pelo código do ajuste. */
export function tipoDoCodigo(codigo: string | null | undefined): TipoDeDesconto {
  const c = (codigo ?? "").toUpperCase()
  if (c.startsWith(PREFIXO_DA_PROMOCAO)) return "promocao"
  if (c.startsWith(PREFIXO_DO_BUMP)) return "oferta"
  if (ehCupomDoCrm(c)) return "crm"
  return "cupom"
}

/** Uma venda como o DRE conta, em reais. */
export type VendaDoDre = {
  id: string
  origem: Origem
  pagoEm: Date
  /** Os produtos pelo preço cobrado ANTES dos cupons (a promoção "de/por" já vale). */
  produtos: number
  /** O frete cobrado, antes do cupom de frete. */
  frete: number
  /** O que foi cobrado do cliente. */
  cobrado: number
  /** De onde vieram os descontos; somam `produtos + frete − cobrado`. */
  descontos: { tipo: TipoDeDesconto; valor: number }[]
  /** Cancelado depois de pago (ou estornado na Nuvemshop): o produto não saiu. */
  cancelada: boolean
  itens: { produto: string | null; nome: string; unidades: number }[]
  estornos: { valor: number; em: Date }[]
  /** Quem cobrou ("Pagar.me", "Mercado Pago") e como — só na loja nova. */
  pagamento: { parceiro: string | null; forma: "pix" | "cartao" | null }
  /**
   * A taxa que o parceiro cobrou, em reais — o job `custos-dos-pedidos` vai
   * buscar; `null` enquanto não chegou. Na Nuvemshop, sempre `null`: lá a taxa
   * entra lançada, mês a mês.
   */
  taxa: number | null
  /** O que a loja paga pela etiqueta (a cotação da Frenet), em reais; `null` sem ela. */
  fretePago: number | null
  /** De onde veio o frete pago: a cotação do checkout, ou a que o job fez depois. */
  freteDe: "checkout" | "depois" | null
}

/** O pedido da loja nova com o que o DRE lê (`pedidosDoFinanceiro`, na rota). */
export type PedidoDoDre = Omit<PedidoCru, "shipping_methods"> & {
  shipping_methods?:
    | {
        amount?: unknown
        adjustments?: { code?: string | null; amount?: unknown }[] | null
        /** O serviço da Frenet, com o preço cotado (`validateFulfillmentData`, desde a 0226). */
        data?: { servico?: { codigo?: unknown; nome?: unknown; preco?: unknown } | null } | null
      }[]
    | null
}

/** O que o job guardou do pedido (`fin_pedido`), em centavos. */
export type CustoGuardado = { taxa?: number | null; frete?: number | null }

/** A venda de um pedido da loja nova — `null` se o dinheiro não entrou. */
export function vendaDaLoja(o: PedidoDoDre, guardado: CustoGuardado = {}): VendaDoDre | null {
  const { pagoEm, parceiro, forma } = pagamentoDo(o as PedidoCru)
  if (!pagoEm) return null
  const itens = o.items ?? []
  const metodos = o.shipping_methods ?? []
  const produtos = soma(itens.map((i) => numero(i.unit_price) * numero(i.quantity)))
  const frete = soma(metodos.map((m) => numero(m.amount)))
  const cobrado = totalDo(o)
  const porTipo = new Map<TipoDeDesconto, number>()
  for (const a of [
    ...itens.flatMap((i) => i.adjustments ?? []),
    ...metodos.flatMap((m) => m.adjustments ?? []),
  ]) {
    const tipo = tipoDoCodigo(a?.code)
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + numero(a?.amount))
  }
  const doAjuste = soma([...porTipo.values()])
  const centavos = arred(produtos + frete - cobrado - doAjuste)
  if (centavos !== 0) porTipo.set("centavos", centavos)
  const pagamentos = (o.payment_collections ?? []).flatMap((c) => c.payments ?? [])
  // A cotação do checkout, em todo método de entrega; sem ela em algum, a que o job fez depois.
  const cotados = metodos.map((m) => m.data?.servico?.preco)
  const doCheckout = cotados.every((c) => typeof c === "number" && Number.isFinite(c))
    ? soma(cotados.map(Number))
    : null
  const depois = typeof guardado.frete === "number" ? arred(guardado.frete / 100) : null
  return {
    id: o.id,
    origem: "loja",
    pagamento: { parceiro, forma },
    taxa: typeof guardado.taxa === "number" ? arred(guardado.taxa / 100) : null,
    fretePago: doCheckout ?? depois,
    freteDe: doCheckout !== null ? "checkout" : depois !== null ? "depois" : null,
    pagoEm,
    produtos,
    frete,
    cobrado,
    descontos: [...porTipo]
      .map(([tipo, valor]) => ({ tipo, valor: arred(valor) }))
      .filter((d) => d.valor !== 0),
    cancelada: o.status === "canceled",
    itens: itens.map((i) => ({
      produto: i.product_id ?? null,
      nome: nomeDoItem(i.product_title ?? i.title),
      unidades: numero(i.quantity),
    })),
    estornos: pagamentos
      .flatMap((p) => p.refunds ?? [])
      .map((r) => {
        const em = r.created_at ? new Date(r.created_at) : pagoEm
        return {
          valor: arred(numero(r.amount)),
          em: Number.isNaN(em.getTime()) ? pagoEm : em,
        }
      })
      .filter((r) => r.valor > 0),
  }
}

/** Um pedido da Nuvemshop (`crm_base_pedido`): os valores em centavos, os itens pelo SKU. */
export type PedidoDaBaseDoDre = {
  numero: string
  pagoEm: Date | string | null
  feitoEm: Date | string
  /** confirmado ou estornado (os outros não entram). */
  pagamento: string
  total: unknown
  desconto: unknown
  frete: unknown
  itens: unknown
}

/** Os produtos de hoje pelo SKU: o item da Nuvemshop vira o produto da loja nova. */
export type ProdutoDoDre = {
  id: string
  titulo: string
  skus: readonly (string | null | undefined)[]
}

const chaveDoSku = (sku: unknown) => (typeof sku === "string" ? sku.trim().toUpperCase() : "")

export function mapaDosSkus(produtos: readonly ProdutoDoDre[]): Map<string, ProdutoDoDre> {
  const mapa = new Map<string, ProdutoDoDre>()
  for (const p of produtos)
    for (const sku of p.skus) {
      const chave = chaveDoSku(sku)
      if (chave && !mapa.has(chave)) mapa.set(chave, p)
    }
  return mapa
}

/**
 * A venda de um pedido da Nuvemshop. O CSV traz o total, o desconto e o
 * frete: os produtos antes dos cupons são o total mais o desconto menos o
 * frete. O estornado entra e sai inteiro no mesmo mês (a Nuvemshop não diz
 * quando estornou).
 */
export function vendaDaNuvemshop(
  o: PedidoDaBaseDoDre,
  doSku: ReadonlyMap<string, ProdutoDoDre>
): VendaDoDre | null {
  if (o.pagamento !== "confirmado" && o.pagamento !== "estornado") return null
  const pagoEm = new Date(o.pagoEm ?? o.feitoEm)
  if (Number.isNaN(pagoEm.getTime())) return null
  const cobrado = arred(numero(o.total) / 100)
  const desconto = arred(numero(o.desconto) / 100)
  const frete = arred(numero(o.frete) / 100)
  const estornado = o.pagamento === "estornado"
  const itens = (Array.isArray(o.itens) ? (o.itens as unknown[]) : []).flatMap((bruto) => {
    const i = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : null
    const unidades = Math.floor(numero(i?.quantidade))
    if (!i || unidades <= 0) return []
    const produto = doSku.get(chaveDoSku(i.sku)) ?? null
    const escrito = typeof i.nome === "string" ? i.nome.trim() : ""
    const nome = produto?.titulo ?? (escrito || "Produto")
    return [{ produto: produto?.id ?? null, nome: nomeDoItem(nome), unidades }]
  })
  return {
    id: `nuvemshop:${o.numero}`,
    origem: "nuvemshop",
    pagamento: { parceiro: null, forma: null },
    taxa: null,
    fretePago: null,
    freteDe: null,
    pagoEm,
    produtos: arred(cobrado + desconto - frete),
    frete,
    cobrado,
    descontos: desconto > 0 ? [{ tipo: "nuvemshop", valor: desconto }] : [],
    cancelada: estornado,
    itens,
    estornos: estornado && cobrado > 0 ? [{ valor: cobrado, em: pagoEm }] : [],
  }
}

/* ── as linhas ────────────────────────────────────────────────────────────── */

export const IDS_DAS_LINHAS = [
  "bruta",
  "vendas",
  "freteCobrado",
  "deducoes",
  "descontos",
  "cancelamentos",
  "simples",
  "liquida",
  "custoDosProdutos",
  "custo",
  "embalagem",
  "lucroBruto",
  "variaveis",
  "taxas",
  "fretePago",
  "comissoes",
  "margem",
  "fixas",
  "marketing",
  "plataforma",
  "pessoal",
  "contador",
  "outras",
  "operacional",
  "financeiro",
  "lucro",
] as const
export type IdDaLinha = (typeof IDS_DAS_LINHAS)[number]

export type TipoDaLinha = "grupo" | "item" | "total" | "final"

export type Detalhe = { nome: string; valor: number | null }

export type Linha = {
  id: IdDaLinha
  nome: string
  tipo: TipoDaLinha
  /** Em reais: o que tira do resultado vem negativo. */
  valor: number
  /** "auto": o sistema calcula; "lancado": sai das Despesas; "misto": os dois. */
  fonte: "auto" | "lancado" | "misto" | null
  /** A etiqueta amarela quando o número está incompleto ("2 sem custo"). */
  falta: string | null
  detalhe: Detalhe[]
}

/** O nome, o tipo e a fonte de cada linha — a ordem é a de `IDS_DAS_LINHAS`. */
const MOLDE: Record<IdDaLinha, { nome: string; tipo: TipoDaLinha; fonte: Linha["fonte"] }> = {
  bruta: { nome: "Receita bruta", tipo: "grupo", fonte: null },
  vendas: { nome: "Vendas de produtos", tipo: "item", fonte: "auto" },
  freteCobrado: { nome: "Frete cobrado do cliente", tipo: "item", fonte: "auto" },
  deducoes: { nome: "(−) Deduções", tipo: "grupo", fonte: null },
  descontos: { nome: "Descontos e cupons", tipo: "item", fonte: "auto" },
  cancelamentos: { nome: "Cancelamentos e estornos", tipo: "item", fonte: "auto" },
  simples: { nome: "Simples Nacional", tipo: "item", fonte: "auto" },
  liquida: { nome: "= Receita líquida", tipo: "total", fonte: null },
  custoDosProdutos: { nome: "(−) Custo dos produtos vendidos", tipo: "grupo", fonte: null },
  custo: { nome: "Custo dos produtos", tipo: "item", fonte: "auto" },
  embalagem: { nome: "Embalagem", tipo: "item", fonte: "auto" },
  lucroBruto: { nome: "= Lucro bruto", tipo: "total", fonte: null },
  variaveis: { nome: "(−) Despesas variáveis", tipo: "grupo", fonte: null },
  taxas: { nome: "Taxas de pagamento", tipo: "item", fonte: "lancado" },
  fretePago: { nome: "Frete pago pela loja", tipo: "item", fonte: "lancado" },
  comissoes: { nome: "Comissões de criadores", tipo: "item", fonte: "lancado" },
  margem: { nome: "= Margem de contribuição", tipo: "total", fonte: null },
  fixas: { nome: "(−) Despesas fixas", tipo: "grupo", fonte: null },
  marketing: { nome: "Marketing e anúncios", tipo: "item", fonte: "lancado" },
  plataforma: { nome: "Plataforma e sistemas", tipo: "item", fonte: "lancado" },
  pessoal: { nome: "Pessoal e pró-labore", tipo: "item", fonte: "lancado" },
  contador: { nome: "Contador", tipo: "item", fonte: "lancado" },
  outras: { nome: "Outras despesas", tipo: "item", fonte: "lancado" },
  operacional: { nome: "= Resultado operacional", tipo: "total", fonte: null },
  financeiro: { nome: "Resultado financeiro", tipo: "item", fonte: "lancado" },
  lucro: { nome: "= Lucro líquido", tipo: "final", fonte: null },
}

/** A linha do DRE de cada categoria de despesa. */
const LINHA_DA_CATEGORIA: Record<Categoria, IdDaLinha> = {
  marketing: "marketing",
  plataforma: "plataforma",
  pessoal: "pessoal",
  contador: "contador",
  outras: "outras",
  taxas: "taxas",
  frete: "fretePago",
  comissoes: "comissoes",
  tarifas: "financeiro",
}

/** O grupo (ou o total) de cada linha — onde a falta de um item aparece no mês a mês. */
const GRUPO_DE: Partial<Record<IdDaLinha, IdDaLinha>> = {
  vendas: "bruta",
  freteCobrado: "bruta",
  descontos: "deducoes",
  cancelamentos: "deducoes",
  simples: "deducoes",
  custo: "custoDosProdutos",
  embalagem: "custoDosProdutos",
  taxas: "variaveis",
  fretePago: "variaveis",
  comissoes: "variaveis",
  marketing: "fixas",
  plataforma: "fixas",
  pessoal: "fixas",
  contador: "fixas",
  outras: "fixas",
}

/* ── o que falta ──────────────────────────────────────────────────────────── */

/** O que o DRE de um mês não sabe — as pendências e as etiquetas saem daqui. */
export type Faltas = {
  /** Produto (o nome) → unidades vendidas sem custo. */
  semCusto: Map<string, number>
  /** Pedidos sem o valor da embalagem. */
  semEmbalagem: number
  /** O Simples do mês: `null` com a do mês; senão o mês de onde veio (ou "nenhuma"). */
  simples: { mes: string; de: string | null } | null
  /** Mês da Nuvemshop com venda e sem a taxa (ou o frete) lançada. */
  taxasDaNuvemshop: string[]
  freteDaNuvemshop: string[]
  /** Pedidos da loja nova ainda sem a taxa lida no parceiro. */
  semTaxa: number
  /** Pedidos no Pix do Pagar.me sem a % do contrato. */
  semPctDoPix: number
  /** Pedidos da loja nova (os que saíram) sem a cotação do frete. */
  semFrete: number
}

const semFaltas = (): Faltas => ({
  semCusto: new Map(),
  semEmbalagem: 0,
  simples: null,
  taxasDaNuvemshop: [],
  freteDaNuvemshop: [],
  semTaxa: 0,
  semPctDoPix: 0,
  semFrete: 0,
})

/* ── o DRE de um mês ──────────────────────────────────────────────────────── */

export type DadosDoDre = {
  vendas: readonly VendaDoDre[]
  despesas: readonly DespesaNoMes[]
  /** Produto → os custos, em centavos, cada um desde um dia. */
  custos: ReadonlyMap<string, readonly Vigencia[]>
  /** Em centavos por pedido. */
  embalagem: readonly Vigencia[]
  /** Em centésimos de ponto (6,54% = 654), desde o dia 1 de cada mês. */
  simples: readonly Vigencia[]
  /** A % do Pix no Pagar.me (centésimos de ponto), cada uma desde um dia. */
  taxaDoPix?: readonly Vigencia[]
}

export type DreDoMes = {
  mes: string
  linhas: Linha[]
  /** Pedidos pagos no mês, sem os cancelados. */
  pedidos: number
  faltas: Faltas
}

const linha = (
  id: IdDaLinha,
  valor: number,
  detalhe: Detalhe[] = [],
  falta: string | null = null,
  fonte: Linha["fonte"] = MOLDE[id].fonte
): Linha => ({
  id,
  ...MOLDE[id],
  fonte,
  valor: arred(valor),
  falta,
  detalhe,
})

/** Soma por nome, na ordem em que apareceu, e tira o que deu zero. */
/**
 * Soma por nome, na ordem em que apareceu, e tira o que deu zero. O nome que
 * conta ("Óleo · 5 unidades", "Pagar.me, cartão (2 pedidos)", "452 pedidos ×
 * R$ 3,20") junta com o de outro mês pelo que vem em volta do número, e o
 * número soma: somando meses, "3 unidades" e "2 unidades" viram "5 unidades".
 */
const CONTADO = /^(.*?)(\d+) (pedidos?|unidades?)(.*)$/
function porNome(itens: readonly Detalhe[]): Detalhe[] {
  const mapa = new Map<
    string,
    { nome: string; valor: number | null; n: number; partes: RegExpExecArray | null }
  >()
  for (const d of itens) {
    const m = CONTADO.exec(d.nome)
    const chave = m ? `${m[1]}#${m[3].replace(/s$/, "")}#${m[4]}` : d.nome
    const antes = mapa.get(chave)
    mapa.set(chave, {
      nome: d.nome,
      valor: d.valor === null ? (antes?.valor ?? null) : arred((antes?.valor ?? 0) + d.valor),
      n: (antes?.n ?? 0) + (m ? Number(m[2]) : 0),
      partes: m,
    })
  }
  return [...mapa.values()]
    .map(({ nome, valor, n, partes }) => {
      if (!partes) return { nome, valor }
      const [, antes, , palavra, depois] = partes
      const um = palavra.replace(/s$/, "")
      return { nome: `${antes}${n} ${n === 1 ? um : `${um}s`}${depois}`, valor }
    })
    .filter((d) => d.valor !== 0)
}

const ORIGEM: Record<Origem, string> = { loja: "Loja nova", nuvemshop: "Nuvemshop" }

export function dreDoMes(mes: string, dados: DadosDoDre): DreDoMes {
  const janela = janelaDoMes(mes)
  const faltas = semFaltas()
  const vendas = dados.vendas.filter((v) => dentro(v.pagoEm, janela))
  const saem = vendas.filter((v) => !v.cancelada)

  // Receita bruta
  const porOrigem = (campo: "produtos" | "frete") =>
    (["loja", "nuvemshop"] as Origem[]).map((o) => ({
      nome: ORIGEM[o],
      valor: soma(vendas.filter((v) => v.origem === o).map((v) => v[campo])),
    }))
  const vendasDeProdutos = soma(vendas.map((v) => v.produtos))
  const freteCobrado = soma(vendas.map((v) => v.frete))
  const bruta = arred(vendasDeProdutos + freteCobrado)

  // Deduções
  const descontos = new Map<TipoDeDesconto, number>()
  for (const v of vendas)
    for (const d of v.descontos) descontos.set(d.tipo, (descontos.get(d.tipo) ?? 0) + d.valor)
  const totalDescontos = soma([...descontos.values()])
  const estornos = dados.vendas.flatMap((v) =>
    v.estornos.filter((e) => dentro(e.em, janela)).map((e) => ({ ...e, venda: v }))
  )
  const inteiros = estornos.filter((e) => e.venda.cancelada)
  const parciais = estornos.filter((e) => !e.venda.cancelada)
  const totalEstornos = soma(estornos.map((e) => e.valor))
  const base = arred(bruta - totalDescontos - totalEstornos)
  const aliquota = aliquotaDoMes(dados.simples, mes)
  const simples = aliquota ? arred((Math.max(base, 0) * aliquota.valor) / 10_000) : 0
  if (vendas.length && (!aliquota || !aliquota.certa))
    faltas.simples = { mes, de: aliquota ? aliquota.de : null }

  // Custo dos produtos
  const custoDe = new Map<string, { unidades: number; valor: number }>()
  for (const v of saem) {
    const dia = chaveDoDia(v.pagoEm)
    for (const i of v.itens) {
      const c = i.produto ? vigente(dados.custos.get(i.produto) ?? [], dia) : null
      if (!c) {
        faltas.semCusto.set(i.nome, (faltas.semCusto.get(i.nome) ?? 0) + i.unidades)
        continue
      }
      const atual = custoDe.get(i.nome) ?? { unidades: 0, valor: 0 }
      custoDe.set(i.nome, {
        unidades: atual.unidades + i.unidades,
        valor: atual.valor + (c.valor * i.unidades) / 100,
      })
    }
  }
  const custo = soma([...custoDe.values()].map((c) => c.valor))
  const detalheDoCusto: Detalhe[] = [
    ...[...custoDe]
      .sort((a, b) => b[1].valor - a[1].valor)
      .map(([nome, c]) => ({
        nome: `${nome} · ${plural(c.unidades, "unidade", "unidades")}`,
        valor: -arred(c.valor),
      })),
    ...[...faltas.semCusto].map(([nome, u]) => ({
      nome: `${nome} · ${plural(u, "unidade", "unidades")} sem custo`,
      valor: null,
    })),
  ]
  const embalagens = new Map<number, number>()
  for (const v of saem) {
    const e = vigente(dados.embalagem, chaveDoDia(v.pagoEm))
    if (!e) faltas.semEmbalagem++
    else embalagens.set(e.valor, (embalagens.get(e.valor) ?? 0) + 1)
  }
  const embalagem = soma([...embalagens].map(([valor, n]) => (valor * n) / 100))

  // Despesas lançadas
  const doMes = dados.despesas.filter((d) => d.mes === mes)
  const lancado = (id: IdDaLinha) => {
    const itens = doMes.filter((d) => LINHA_DA_CATEGORIA[d.categoria as Categoria] === id)
    return {
      valor: -soma(itens.map((d) => d.valor / 100)),
      detalhe: porNome(itens.map((d) => ({ nome: d.descricao, valor: -arred(d.valor / 100) }))),
      tem: itens.length > 0,
    }
  }

  /*
    A TAXA E O FRETE: os da Nuvemshop, só lançados; os da loja nova, pedido a
    pedido — a taxa de toda venda paga (`taxaDe`, logo abaixo), o frete das
    que saíram. O que ainda não chegou é falta.
  */
  const daNuvemshop = vendas.some((v) => v.origem === "nuvemshop") && mes <= MES_DA_LOJA_NOVA
  const daLoja = vendas.filter((v) => v.origem === "loja")
  const saemDaLoja = saem.filter((v) => v.origem === "loja")
  /*
    A taxa de cada venda: a do cartão e a do Mercado Pago, a que o job leu,
    voltando na proporção do que foi estornado (a taxa do cartão e a do
    Mercado Pago voltam com o estorno); a do Pix do Pagar.me, a % do
    contrato sobre o cobrado — e ela não volta.
  */
  const taxaDe = (v: VendaDoDre): number | null => {
    if (v.pagamento.parceiro === PAGARME.nome && v.pagamento.forma === "pix") {
      const pct = vigente(dados.taxaDoPix ?? [], chaveDoDia(v.pagoEm))
      return pct ? arred((v.cobrado * pct.valor) / 10_000) : null
    }
    if (v.taxa === null) return null
    const estornado = v.estornos.reduce((s, e) => s + e.valor, 0)
    const fica = v.cobrado > 0 ? Math.max(0, v.cobrado - estornado) / v.cobrado : 1
    return arred(v.taxa * fica)
  }
  const ehPixDoPagarme = (v: VendaDoDre) =>
    v.pagamento.parceiro === PAGARME.nome && v.pagamento.forma === "pix"
  faltas.semPctDoPix = daLoja.filter((v) => ehPixDoPagarme(v) && taxaDe(v) === null).length
  faltas.semTaxa = daLoja.filter((v) => !ehPixDoPagarme(v) && taxaDe(v) === null).length
  faltas.semFrete = saemDaLoja.filter((v) => v.fretePago === null).length
  const automatico = (
    grupos: Map<string, { n: number; valor: number }>,
    lancadoAqui: ReturnType<typeof lancado>
  ) => {
    const auto = soma([...grupos.values()].map((g) => g.valor))
    const temAuto = [...grupos.values()].some((g) => g.n > 0)
    return {
      valor: arred(lancadoAqui.valor - auto),
      detalhe: [
        ...[...grupos].map(([nome, g]) => ({
          nome: `${nome} (${plural(g.n, "pedido", "pedidos")})`,
          valor: -arred(g.valor),
        })),
        ...lancadoAqui.detalhe,
      ],
      tem: lancadoAqui.tem,
      fonte: (temAuto && lancadoAqui.tem
        ? "misto"
        : temAuto
          ? "auto"
          : "lancado") as Linha["fonte"],
    }
  }
  const agrupar = (
    lista: VendaDoDre[],
    valor: (v: VendaDoDre) => number | null,
    nome: (v: VendaDoDre) => string
  ) => {
    const grupos = new Map<string, { n: number; valor: number }>()
    for (const v of lista) {
      const x = valor(v)
      if (x === null) continue
      const g = grupos.get(nome(v)) ?? { n: 0, valor: 0 }
      grupos.set(nome(v), { n: g.n + 1, valor: g.valor + x })
    }
    return grupos
  }
  const NOME_DA_FORMA = { pix: "Pix", cartao: "cartão" } as const
  const taxas = automatico(
    agrupar(daLoja, taxaDe, (v) =>
      [
        v.pagamento.parceiro ?? "Pagamento",
        v.pagamento.forma ? NOME_DA_FORMA[v.pagamento.forma] : null,
      ]
        .filter(Boolean)
        .join(", ")
    ),
    lancado("taxas")
  )
  const fretePago = automatico(
    agrupar(
      saemDaLoja,
      (v) => v.fretePago,
      (v) => (v.freteDe === "depois" ? "Frenet, cotado depois" : "Frenet, cotação do checkout")
    ),
    lancado("fretePago")
  )
  if (daNuvemshop && !taxas.tem) faltas.taxasDaNuvemshop.push(mes)
  if (daNuvemshop && !fretePago.tem) faltas.freteDaNuvemshop.push(mes)
  const faltaNa = (lancou: boolean, semNaLoja: number, texto: string) =>
    daNuvemshop && !lancou ? "falta lançar" : semNaLoja ? `${semNaLoja} ${texto}` : null

  const comissoes = lancado("comissoes")
  const fixas = (["marketing", "plataforma", "pessoal", "contador", "outras"] as const).map(
    (id) => ({ id, ...lancado(id) })
  )
  const financeiro = lancado("financeiro")

  const liquida = arred(base - simples)
  const lucroBruto = arred(liquida - custo - embalagem)
  const variaveis = arred(taxas.valor + fretePago.valor + comissoes.valor)
  const margem = arred(lucroBruto + variaveis)
  const totalFixas = soma(fixas.map((f) => f.valor))
  const operacional = arred(margem + totalFixas)
  const lucro = arred(operacional + financeiro.valor)

  const detalheDoSimples: Detalhe[] = aliquota
    ? [
        {
          nome: `${Mes(mes)}: ${reais(Math.max(base, 0))} × ${emPorcento(aliquota.valor)}${aliquota.certa ? "" : ` (a de ${nomeDoMes(aliquota.de)})`}`,
          valor: -simples,
        },
      ]
    : vendas.length
      ? [{ nome: `${mesEAno(mes)}: sem a alíquota`, valor: null }]
      : []

  const linhas: Linha[] = [
    linha("bruta", bruta),
    linha("vendas", vendasDeProdutos, porOrigem("produtos")),
    linha("freteCobrado", freteCobrado, porOrigem("frete")),
    linha("deducoes", -(totalDescontos + totalEstornos + simples)),
    linha(
      "descontos",
      -totalDescontos,
      ORDEM_DOS_DESCONTOS.flatMap((t) =>
        descontos.get(t) ? [{ nome: NOME_DO_DESCONTO[t], valor: -arred(descontos.get(t)!) }] : []
      )
    ),
    linha(
      "cancelamentos",
      -totalEstornos,
      [
        {
          nome: `Cancelados ou estornados inteiros (${plural(inteiros.length, "pedido", "pedidos")})`,
          valor: -soma(inteiros.map((e) => e.valor)),
        },
        {
          nome: `Estornos de parte do pedido (${plural(parciais.length, "pedido", "pedidos")})`,
          valor: -soma(parciais.map((e) => e.valor)),
        },
      ].filter((d) => d.valor !== 0)
    ),
    linha(
      "simples",
      -simples,
      detalheDoSimples,
      faltas.simples
        ? faltas.simples.de
          ? `% de ${nomeDoMes(faltas.simples.de)}`
          : "sem alíquota"
        : null
    ),
    linha("liquida", liquida),
    linha("custoDosProdutos", -(custo + embalagem)),
    linha(
      "custo",
      -custo,
      detalheDoCusto,
      faltas.semCusto.size ? plural(faltas.semCusto.size, "sem custo", "sem custo") : null
    ),
    linha(
      "embalagem",
      -embalagem,
      [
        ...[...embalagens].map(([valor, n]) => ({
          nome: `${plural(n, "pedido", "pedidos")} × ${reais(valor / 100)}`,
          valor: -arred((valor * n) / 100),
        })),
        ...(faltas.semEmbalagem
          ? [
              {
                nome: `${plural(faltas.semEmbalagem, "pedido", "pedidos")} sem o valor`,
                valor: null,
              },
            ]
          : []),
      ],
      faltas.semEmbalagem ? "sem valor" : null
    ),
    linha("lucroBruto", lucroBruto),
    linha("variaveis", variaveis),
    linha(
      "taxas",
      taxas.valor,
      taxas.detalhe,
      faltaNa(taxas.tem, faltas.semTaxa + faltas.semPctDoPix, "sem a taxa"),
      taxas.fonte
    ),
    linha(
      "fretePago",
      fretePago.valor,
      fretePago.detalhe,
      faltaNa(fretePago.tem, faltas.semFrete, "sem a cotação"),
      fretePago.fonte
    ),
    linha("comissoes", comissoes.valor, comissoes.detalhe),
    linha("margem", margem),
    linha("fixas", totalFixas),
    ...fixas.map((f) => linha(f.id, f.valor, f.detalhe)),
    linha("operacional", operacional),
    linha("financeiro", financeiro.valor, financeiro.detalhe),
    linha("lucro", lucro),
  ]
  return { mes, linhas, pedidos: saem.length, faltas }
}

/* ── o DRE de vários meses ────────────────────────────────────────────────── */

export type Pendencia = {
  id:
    | "custo"
    | "embalagem"
    | "simples"
    | "taxas"
    | "frete"
    | "taxa-do-pix"
    | "taxa-da-loja"
    | "frete-da-loja"
  texto: string
  /** A aba onde se resolve. */
  onde: "custos" | "despesas" | null
}

export type DreDoPeriodo = {
  meses: string[]
  linhas: Linha[]
  pedidos: number
  pendencias: Pendencia[]
}

/** A etiqueta de quem soma meses: a de um mês só, ou a primeira que aparecer. */
const primeiraFalta = (ls: Linha[]) => ls.find((l) => l.falta)?.falta ?? null

/** Soma os meses: cada linha, cada detalhe pelo nome, as faltas e as pendências. */
export function dreDoPeriodo(dres: readonly DreDoMes[]): DreDoPeriodo {
  const linhas = IDS_DAS_LINHAS.map((id) => {
    const doId = dres.map((d) => d.linhas.find((l) => l.id === id)!)
    const detalhe = porNome(doId.flatMap((l) => l.detalhe))
    // A fonte de quem soma meses: a dos meses com valor; "misto" quando divergem.
    const fontes = new Set(doId.filter((l) => l.valor !== 0).map((l) => l.fonte))
    const fonte: Linha["fonte"] =
      fontes.has("misto") || (fontes.has("auto") && fontes.has("lancado"))
        ? "misto"
        : fontes.has("auto")
          ? "auto"
          : fontes.has("lancado")
            ? "lancado"
            : MOLDE[id].fonte
    return {
      ...linha(id, soma(doId.map((l) => l.valor)), detalhe, null, fonte),
      falta: dres.length === 1 ? doId[0].falta : primeiraFalta(doId),
    }
  })
  // As etiquetas que dependem da soma: quantos produtos sem custo no período todo.
  const semCusto = new Map<string, number>()
  for (const d of dres)
    for (const [nome, u] of d.faltas.semCusto) semCusto.set(nome, (semCusto.get(nome) ?? 0) + u)
  const custo = linhas.find((l) => l.id === "custo")!
  if (semCusto.size) custo.falta = plural(semCusto.size, "sem custo", "sem custo")

  const pendencias: Pendencia[] = []
  if (semCusto.size) {
    const nomes = [...semCusto.keys()]
    const unidades = [...semCusto.values()].reduce((s, u) => s + u, 0)
    pendencias.push({
      id: "custo",
      texto: `${plural(nomes.length, "produto", "produtos")} sem custo — ${juntar(nomes)} (${plural(unidades, "unidade", "unidades")}). O custo dos produtos está menor do que foi.`,
      onde: "custos",
    })
  }
  const semEmbalagem = dres.reduce((s, d) => s + d.faltas.semEmbalagem, 0)
  if (semEmbalagem)
    pendencias.push({
      id: "embalagem",
      texto: `Sem o valor da embalagem por pedido (${plural(semEmbalagem, "pedido", "pedidos")}).`,
      onde: "custos",
    })
  const simples = dres.flatMap((d) => (d.faltas.simples ? [d.faltas.simples] : []))
  if (simples.length) {
    const estimadas = simples.filter((s) => s.de)
    const sem = simples.filter((s) => !s.de)
    const partes: string[] = []
    if (estimadas.length === 1)
      partes.push(
        `A alíquota do Simples de ${nomeDoMes(estimadas[0].mes)} não veio: usei a de ${nomeDoMes(estimadas[0].de!)}.`
      )
    else if (estimadas.length)
      partes.push(
        `Sem a alíquota do Simples de ${juntar(estimadas.map((s) => nomeDoMes(s.mes)))}: usei a do último mês que tem.`
      )
    if (sem.length)
      partes.push(
        `Sem nenhuma alíquota do Simples até ${nomeDoMes(sem.at(-1)!.mes)}: o imposto ficou de fora.`
      )
    pendencias.push({ id: "simples", texto: partes.join(" "), onde: "custos" })
  }
  const taxas = dres.flatMap((d) => d.faltas.taxasDaNuvemshop)
  const frete = dres.flatMap((d) => d.faltas.freteDaNuvemshop)
  if (taxas.length)
    pendencias.push({
      id: "taxas",
      texto: `As taxas da Nuvemshop de ${juntar(taxas.map(nomeDoMes))} não foram lançadas.`,
      onde: "despesas",
    })
  if (frete.length)
    pendencias.push({
      id: "frete",
      texto: `O frete pago na Nuvemshop em ${juntar(frete.map(nomeDoMes))} não foi lançado.`,
      onde: "despesas",
    })
  const semPctDoPix = dres.reduce((s, d) => s + d.faltas.semPctDoPix, 0)
  if (semPctDoPix)
    pendencias.push({
      id: "taxa-do-pix",
      texto: `Sem a % do Pix no Pagar.me (a do contrato: a API não traz): ${plural(semPctDoPix, "pedido", "pedidos")} no Pix sem a taxa.`,
      onde: "custos",
    })
  const semTaxa = dres.reduce((s, d) => s + d.faltas.semTaxa, 0)
  if (semTaxa)
    pendencias.push({
      id: "taxa-da-loja",
      texto: `A taxa de ${plural(semTaxa, "pedido", "pedidos")} da loja nova ainda não chegou do Pagar.me ou do Mercado Pago — a leitura roda sozinha a cada 30 minutos.`,
      onde: null,
    })
  const semFrete = dres.reduce((s, d) => s + d.faltas.semFrete, 0)
  if (semFrete)
    pendencias.push({
      id: "frete-da-loja",
      texto: `${plural(semFrete, "pedido", "pedidos")} da loja nova sem a cotação do frete — a cotação roda sozinha a cada 30 minutos.`,
      onde: null,
    })

  return {
    meses: dres.map((d) => d.mes),
    linhas,
    pedidos: dres.reduce((s, d) => s + d.pedidos, 0),
    pendencias,
  }
}

/* ── o que a tela recebe ──────────────────────────────────────────────────── */

export type LinhaNaTela = Linha & {
  /** De cada R$ 100 da receita bruta ("15,7" → 15.7), ou `null` sem receita. */
  pct: number | null
  /** O valor no período de antes, ou `null` sem comparar. */
  antes: number | null
  pctAntes: number | null
  /** Quanto o tamanho mudou, em % ("−40,7"), ou `null` sem o de antes (ou com ele zero). */
  variacao: number | null
}

const pctDe = (valor: number, bruta: number) =>
  bruta > 0 ? Math.round((valor / bruta) * 1000) / 10 : null

/** As linhas do período com o % da receita e a comparação com o de antes. */
export function linhasNaTela(atual: DreDoPeriodo, antes: DreDoPeriodo | null): LinhaNaTela[] {
  const brutaDe = (d: DreDoPeriodo) => d.linhas.find((l) => l.id === "bruta")!.valor
  return atual.linhas.map((l) => {
    const a = antes?.linhas.find((x) => x.id === l.id) ?? null
    const variacao =
      a && a.valor !== 0
        ? Math.round(((Math.abs(l.valor) - Math.abs(a.valor)) / Math.abs(a.valor)) * 1000) / 10
        : null
    return {
      ...l,
      pct: pctDe(l.valor, brutaDe(atual)),
      antes: a ? a.valor : null,
      pctAntes: a && antes ? pctDe(a.valor, brutaDe(antes)) : null,
      variacao,
    }
  })
}

/** "De cada R$ 100 vendidos": pra onde foi cada parte da receita bruta. */
export type PedacoDos100 = { nome: string; valor: number; sobra: boolean }

export function deCada100(d: DreDoPeriodo): PedacoDos100[] {
  const v = (id: IdDaLinha) => d.linhas.find((l) => l.id === id)!.valor
  const bruta = v("bruta")
  if (!(bruta > 0)) return []
  const parte = (valor: number) => Math.round((valor / bruta) * 10_000) / 100
  const lucro = v("lucro")
  return [
    {
      nome: "Descontos e cancelamentos",
      valor: parte(-(v("descontos") + v("cancelamentos"))),
      sobra: false,
    },
    { nome: "Imposto (Simples)", valor: parte(-v("simples")), sobra: false },
    { nome: "Produto e embalagem", valor: parte(-v("custoDosProdutos")), sobra: false },
    { nome: "Taxas, frete e comissões", valor: parte(-v("variaveis")), sobra: false },
    {
      nome: "Despesas fixas e financeiras",
      valor: parte(-(v("fixas") + v("financeiro"))),
      sobra: false,
    },
    { nome: lucro >= 0 ? "Sobra (lucro)" : "Faltou (prejuízo)", valor: parte(lucro), sobra: true },
  ]
}

/* ── o mês a mês ──────────────────────────────────────────────────────────── */

export type ColunaDoMes = {
  mes: string
  /** "Set" */
  curto: string
  /** "Nuvemshop", "Nuvemshop + loja nova" ou "Loja nova". */
  origem: string
  valores: Record<IdDaLinha, number>
  /** A margem líquida: o lucro de cada R$ 100 vendidos, ou `null` sem venda. */
  margemLiquida: number | null
  /** As linhas que o mês não fecha — a de onde falta e as que vêm depois dela. */
  incompletas: IdDaLinha[]
}

const TOTAIS: IdDaLinha[] = ["liquida", "lucroBruto", "margem", "operacional", "lucro"]

/** A linha com falta, o grupo dela e os totais que vêm depois. */
function incompletasDe(ls: readonly Linha[]): IdDaLinha[] {
  const ids = new Set<IdDaLinha>()
  let primeira = Infinity
  for (const l of ls) {
    if (!l.falta) continue
    ids.add(l.id)
    const grupo = GRUPO_DE[l.id]
    if (grupo) ids.add(grupo)
    primeira = Math.min(primeira, IDS_DAS_LINHAS.indexOf(l.id))
  }
  for (const t of TOTAIS) if (IDS_DAS_LINHAS.indexOf(t) > primeira) ids.add(t)
  return IDS_DAS_LINHAS.filter((id) => ids.has(id))
}

export function colunaDoMes(d: DreDoMes): ColunaDoMes {
  const valores = Object.fromEntries(d.linhas.map((l) => [l.id, l.valor])) as Record<
    IdDaLinha,
    number
  >
  return {
    mes: d.mes,
    curto: mesCurto(d.mes),
    origem:
      d.mes < MES_DA_LOJA_NOVA
        ? "Nuvemshop"
        : d.mes === MES_DA_LOJA_NOVA
          ? "Nuvemshop + loja nova"
          : "Loja nova",
    valores,
    margemLiquida: pctDe(valores.lucro, valores.bruta),
    incompletas: incompletasDe(d.linhas),
  }
}
