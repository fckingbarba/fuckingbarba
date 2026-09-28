import { numeroBrasileiro } from "../cupons"
import { chaveDoDia } from "./formato"
import { nomeCurto, pagamentoDo, totalDo, type PedidoCru } from "./pedido"
import {
  baldeDoInstante,
  baldesDo,
  datasComOAntes,
  datasNoGoogle,
  dentro,
  lerPeriodo,
  meiaNoite,
  periodoEmFrase,
  periodoNaTela,
  somarDias,
  type Atalho,
  type Comparado,
  type Janela,
  type Periodo,
  type PeriodoNaTela,
} from "./periodo"
import { diaNoFuso, fusoDa, horaNoFuso, type RelatorioGa4 } from "./visitas"

// As datas moraram aqui até a 0191; quem importa daqui segue importando.
export { dentro, meiaNoite, somarDias, type Comparado, type Janela, type Periodo }

/**
 * O MARKETING DO PAINEL — os números que decidem a venda, por período, contra
 * o período de antes. É a área "Marketing" do protótipo
 * (`apps/loja/ferramentas/porte/prototipo-painel.html`), que chega em partes;
 * esta é a do RESUMO: receita, pedidos pagos, visitas, conversão e ticket
 * médio; a receita no tempo; os produtos que mais venderam; e a meta do mês.
 *
 * Código puro, como o `inicio.ts`: recebe os pedidos (e a resposta do GA4) e
 * devolve a tela pronta. Os testes moram em `__tests__/marketing.unit.spec.ts`.
 *
 * "VENDA" É PEDIDO PAGO — a regra do Início: Pix esperando e cartão em
 * análise ficam de fora, e pedido pago depois cancelado também. Conta no
 * dia em que o dinheiro entrou, com o frete.
 *
 * O PERÍODO É O DA BARRA DE CIMA (`periodo.ts`, 0191 — o mesmo do Início):
 * hoje, ontem, 7, 30 ou 90 dias, este mês, o mês passado ou as datas
 * escolhidas; o de antes, do mesmo tamanho, terminando na mesma hora quando
 * o período chega até agora (o hoje pela metade não compete com um dia
 * inteiro). Sem nada no endereço, os últimos 30 dias (`PERIODO_PADRAO`).
 * Sem comparar, os números vêm com o `antes` nulo.
 *
 * AS VISITAS SÃO DO GOOGLE, com o atraso dele (horas — ver `visitas.ts`):
 * as de hoje contam até a hora que ele já somou, e o período de antes, até
 * a mesma hora. E só as visitas do endereço da loja (`hostsDaLoja`): o
 * Analytics é o mesmo do site antigo, da Nuvemshop, que segue no ar até a
 * virada.
 *
 * ┌─ A CONVERSÃO COMPARA GENTE IGUAL ──────────────────────────────────────┐
 * │ O Google não vê quem recusa os cookies (desde a 0166 ele conta todo    │
 * │ mundo que não recusou; antes, só quem aceitava). A conversão divide as │
 * │ compras que ele viu (as que a loja manda pelo servidor) pelas visitas  │
 * │ — as duas do Google, no mesmo corte de hora, como nos Canais. Até a    │
 * │ 0135 ela dividia TODOS os pedidos pagos pelas visitas do Google: quem  │
 * │ recusa compra, mas não vira visita, e a conversão subia.               │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const FUSO = "America/Sao_Paulo"
const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/** O que o Marketing abre sem escolha (o protótipo): um dia só é pouco pra concluir. */
export const PERIODO_PADRAO = "30d" as const

/**
 * As janelas de um botão ("hoje", "7d", "30d"…), com o de antes: o que o CRM
 * usa — os períodos dele seguem os três botões de antes da 0191.
 */
export function janelasDo(atalho: Atalho, agora: Date) {
  const p = lerPeriodo({ periodo: atalho }, agora)
  return { dias: p.dias, atual: p.atual, antes: p.antes!.janela }
}

const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const centavos = (v: number) => Math.round(v * 100) / 100

export const mesDe = (agora: Date) => chaveDoDia(agora).slice(0, 7)

/**
 * Desde quando ler os pedidos: o começo do período de antes, ou o do mês (a
 * meta), o que vier primeiro — com três dias de folga, pro pedido feito antes
 * e pago dentro (o cartão que ficou em análise).
 */
export function lerPedidosDesde(p: Periodo, agora: Date): Date {
  const comeco = p.antes?.janela.de ?? p.atual.de
  const mes = meiaNoite(`${mesDe(agora)}-01`)
  return new Date(Math.min(comeco.getTime(), mes.getTime()) - 3 * DIA_MS)
}

/* ── as vendas ────────────────────────────────────────────────────────────── */

export type ItemVendido = {
  produto: string
  /** O endereço do produto ("oleo-para-barba"): o leve junto de cada um é por endereço. */
  handle: string | null
  nome: string
  imagem: string | null
  unidades: number
  receita: number
  /** Os descontos com código: o cupom e a oferta do checkout ("BUMP-…"). */
  ajustes: { codigo: string; valor: number }[]
}
export type Venda = { id: string; pagoEm: Date; total: number; itens: ItemVendido[] }

/** Os pedidos pagos (e não cancelados), com a hora em que o dinheiro entrou. */
export function vendasDos(pedidos: PedidoCru[]): Venda[] {
  return pedidos.flatMap((o) => {
    const { pagoEm } = pagamentoDo(o)
    if (!pagoEm || o.status === "canceled") return []
    const itens = (o.items ?? []).map((i) => {
      const unidades = numero(i.quantity)
      return {
        produto: i.product_id ?? i.product_title ?? i.title ?? i.id,
        handle: i.product_handle ?? null,
        nome: nomeCurto(i.product_title ?? i.title ?? "Produto"),
        imagem: i.thumbnail ?? null,
        unidades,
        receita: centavos(numero(i.total) || numero(i.unit_price) * unidades),
        ajustes: (i.adjustments ?? []).flatMap((a) =>
          a?.code ? [{ codigo: a.code, valor: centavos(numero(a.amount)) }] : []
        ),
      }
    })
    return [{ id: o.id, pagoEm, total: totalDo(o), itens }]
  })
}

export const variacao = (agora: number, antes: number): number | null =>
  antes > 0 ? Math.round(((agora - antes) / antes) * 100) : null

const comparar = (valor: number, antes: number | null): Comparado => ({
  valor,
  antes,
  variacao: antes === null ? null : variacao(valor, antes),
})

/** A receita e os pedidos pagos numa janela. */
export function somaNa(vendas: Venda[], j: Janela) {
  const nela = vendas.filter((v) => dentro(v.pagoEm, j))
  return { receita: centavos(nela.reduce((s, v) => s + v.total, 0)), pedidos: nela.length }
}

export type NumerosDoPeriodo = { receita: Comparado; pedidos: Comparado; ticket: Comparado }

export function numerosDo(vendas: Venda[], p: Periodo): NumerosDoPeriodo {
  const agora = somaNa(vendas, p.atual)
  const antes = p.antes ? somaNa(vendas, p.antes.janela) : null
  const ticket = (s: { receita: number; pedidos: number }) =>
    s.pedidos ? centavos(s.receita / s.pedidos) : 0
  return {
    receita: comparar(agora.receita, antes?.receita ?? null),
    pedidos: comparar(agora.pedidos, antes?.pedidos ?? null),
    ticket: comparar(ticket(agora), antes ? ticket(antes) : null),
  }
}

/* ── a receita no tempo ───────────────────────────────────────────────────── */

/**
 * Uma barra do gráfico: `rotulo` embaixo (vazio pra não amontoar), `nome` o
 * completo ("24/09", "9h", "07/09 a 13/09"), e `agora` a de hoje (ou desta hora).
 */
export type Barra = { rotulo: string; nome: string; valor: number; pedidos: number; agora: boolean }
export type Serie = { titulo: string; barras: Barra[] }

export function serieDo(p: Periodo, vendas: Venda[], agora: Date): Serie {
  const baldes = baldesDo(p, agora)
  // Hoje, hora a hora: até a de agora (a barra do futuro não tem o que mostrar).
  const quantas =
    p.passo === "hora" && p.ateAgora ? baldes.findIndex((b) => b.agora) + 1 : baldes.length
  const barras: Barra[] = baldes
    .slice(0, quantas)
    .map((b) => ({ rotulo: b.rotulo, nome: b.nome, valor: 0, pedidos: 0, agora: b.agora }))
  for (const v of vendas) {
    if (!dentro(v.pagoEm, p.atual)) continue
    const b = barras[baldeDoInstante(p, v.pagoEm)]
    if (!b) continue
    b.valor = centavos(b.valor + v.total)
    b.pedidos++
  }
  const por = p.passo === "hora" ? "hora" : p.passo === "dia" ? "dia" : "semana"
  return { titulo: `Receita por ${por}, ${periodoEmFrase(p)}`, barras }
}

/* ── os produtos ──────────────────────────────────────────────────────────── */

export type ProdutoVendido = {
  nome: string
  imagem: string | null
  unidades: number
  receita: number
}

/** Os que mais venderam no período, em reais (o frete fica de fora: é do pedido). */
export function maisVendidosNo(vendas: Venda[], j: Janela, maximo = 5): ProdutoVendido[] {
  const soma = new Map<string, ProdutoVendido>()
  for (const v of vendas) {
    if (!dentro(v.pagoEm, j)) continue
    for (const i of v.itens) {
      const atual = soma.get(i.produto) ?? {
        nome: i.nome,
        imagem: i.imagem,
        unidades: 0,
        receita: 0,
      }
      atual.unidades += i.unidades
      atual.receita = centavos(atual.receita + i.receita)
      soma.set(i.produto, atual)
    }
  }
  return [...soma.values()]
    .sort(
      (a, b) => b.receita - a.receita || b.unidades - a.unidades || a.nome.localeCompare(b.nome)
    )
    .slice(0, maximo)
}

/* ── a meta do mês ────────────────────────────────────────────────────────── */

/** No `metadata` da loja: `{ "2026-09": 12000 }` — um valor por mês, e os de antes ficam. */
export const CHAVE_DAS_METAS = "fb_metas"
/** Meta acima disso é um zero a mais. */
const META_MAXIMA = 10_000_000

export type Metas = Record<string, number>

export function lerMetas(metadata: unknown): Metas {
  const bruto = (metadata as Record<string, unknown> | null | undefined)?.[CHAVE_DAS_METAS]
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {}
  const metas: Metas = {}
  for (const [mes, v] of Object.entries(bruto as Record<string, unknown>))
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && typeof v === "number" && v > 0 && v <= META_MAXIMA)
      metas[mes] = centavos(v)
  return metas
}

/** "12.000", "R$ 12.000,00" ou 12000 → 12000; vazio → `null` (tira a meta); o resto, recusado. */
export function lerValorDaMeta(v: unknown): number | null | "invalido" {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null
  const n = numeroBrasileiro(v)
  if (n === null || !(n > 0) || n > META_MAXIMA) return "invalido"
  return centavos(n)
}

export type MetaDoMes = {
  /** "2026-09" */
  mes: string
  /** "setembro" */
  nome: string
  /** A meta; `null` sem meta pro mês. */
  valor: number | null
  /** A receita do mês até agora. */
  feito: number
  /** Hoje é o dia `dia` de um mês de `dias`; `restam` conta hoje. */
  dia: number
  dias: number
  restam: number
  /** Receita por dia até aqui, e onde o mês fecha nesse ritmo. */
  ritmo: number
  projecao: number
  /** Pra bater: quanto por dia, nos dias que restam. `null` sem meta, ou batida. */
  porDia: number | null
}

const NOME_DO_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, month: "long" })

export function metaDoMes(metas: Metas, vendas: Venda[], agora: Date): MetaDoMes {
  const hoje = chaveDoDia(agora)
  const mes = hoje.slice(0, 7)
  const [ano, m] = mes.split("-").map(Number)
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const diaDeHoje = Number(hoje.slice(8, 10))
  const comeco = meiaNoite(`${mes}-01`)
  const feito = somaNa(vendas, { de: comeco, ate: agora }).receita
  const ritmo = centavos(feito / diaDeHoje)
  const valor = metas[mes] ?? null
  const restam = dias - diaDeHoje + 1
  return {
    mes,
    nome: NOME_DO_MES.format(comeco),
    valor,
    feito,
    dia: diaDeHoje,
    dias,
    restam,
    ritmo,
    projecao: centavos(ritmo * dias),
    porDia: valor !== null && feito < valor ? centavos((valor - feito) / restam) : null,
  }
}

/* ── o resumo ─────────────────────────────────────────────────────────────── */

export type Resumo = {
  periodo: PeriodoNaTela
  numeros: NumerosDoPeriodo
  serie: Serie
  maisVendidos: ProdutoVendido[]
  meta: MetaDoMes
}

export function montarResumo(p: Periodo, pedidos: PedidoCru[], metas: Metas, agora: Date): Resumo {
  const vendas = vendasDos(pedidos)
  return {
    periodo: periodoNaTela(p),
    numeros: numerosDo(vendas, p),
    serie: serieDo(p, vendas, agora),
    maisVendidos: maisVendidosNo(vendas, p.atual),
    meta: metaDoMes(metas, vendas, agora),
  }
}

/* ── as visitas e a conversão ─────────────────────────────────────────────── */

/**
 * Os endereços da loja, pro GA4 contar só eles: o do `LOJA_URL`, com e sem o
 * "www". Antes da virada é o da Vercel; depois, o domínio — o `LOJA_URL`
 * troca junto (está na lista da virada, no ESTADO). Sem ele, conta tudo.
 */
export function hostsDaLoja(url: string | undefined): string[] {
  let host = ""
  try {
    host = new URL(url ?? "").hostname.toLowerCase()
  } catch {
    return []
  }
  if (!host) return []
  const sem = host.replace(/^www\./, "")
  return [...new Set([host, sem, `www.${sem}`])]
}

/** O filtro das visitas: só as páginas do endereço da loja (sem endereço, tudo). */
export const soDoEndereco = (hosts: string[]) =>
  hosts.length ? { filter: { fieldName: "hostName", inListFilter: { values: hosts } } } : null

/**
 * O filtro das compras: as que a loja manda pro GA4 pelo servidor. Elas não
 * têm página (e o filtro do endereço as deixaria de fora); o `transactionId`
 * é o id do pedido no Medusa, "order_…" — as do site antigo são números.
 */
export const SO_AS_COMPRAS_DA_LOJA = {
  filter: {
    fieldName: "transactionId",
    stringFilter: { matchType: "BEGINS_WITH", value: "order_" },
  },
}

/** O período inteiro, pro GA4: do primeiro dia ao último (as datas escritas — 0191). */
export const datasDo = (p: Periodo) => datasNoGoogle(p)

/** A pergunta ao GA4: as visitas por dia e hora, do período e do de antes. */
export function perguntaDasVisitas(p: Periodo, hosts: string[]) {
  const endereco = soDoEndereco(hosts)
  return {
    dateRanges: datasComOAntes(p),
    dimensions: [{ name: "date" }, { name: "hour" }],
    metrics: [{ name: "sessions" }],
    ...(endereco ? { dimensionFilter: endereco } : {}),
    // Seis meses e os seis de antes, hora a hora: ~8.900 linhas.
    limit: "10000",
  }
}

/**
 * A pergunta das compras da conversão: as que a loja manda pro GA4 pelo
 * servidor (`SO_AS_COMPRAS_DA_LOJA`, só com o sim dos cookies), por dia e
 * hora, nas mesmas datas das visitas — o corte de hora vale pras duas.
 */
export function perguntaDasCompras(p: Periodo) {
  return {
    dateRanges: datasComOAntes(p),
    dimensions: [{ name: "date" }, { name: "hour" }],
    metrics: [{ name: "ecommercePurchases" }],
    dimensionFilter: SO_AS_COMPRAS_DA_LOJA,
    limit: "10000",
  }
}

export type Conversao = { valor: number | null; antes: number | null; variacao: number | null }

export type VisitasDoPeriodo = {
  visitas: Comparado
  /**
   * As compras que o Google viu, no mesmo corte das visitas: é o que a
   * conversão divide. Sem quem recusou os cookies, como as visitas — os
   * pedidos pagos de todo mundo são os do Resumo (`numerosDo`).
   */
  pedidos: Comparado
  /** De cada 100 visitas, quantas viraram pedido pago (duas casas), as duas contas do Google. */
  conversao: Conversao
  /** As visitas de hoje contam até esta hora (sem ela); `null` enquanto o Google não somou nada de hoje. */
  ate: number | null
}

/** Um relatório do GA4 por dia e hora, como `{ "2026-09-24": [24 horas] }`. */
function porDiaEHora(r: RelatorioGa4): Map<string, number[]> {
  const porDia = new Map<string, number[]>()
  for (const l of r.rows ?? []) {
    const d = l.dimensionValues?.[0]?.value ?? ""
    const h = Number(l.dimensionValues?.[1]?.value)
    const v = numero(l.metricValues?.[0]?.value)
    if (!/^\d{8}$/.test(d) || !Number.isInteger(h) || h < 0 || h > 23 || !(v > 0)) continue
    const chave = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const horas = porDia.get(chave) ?? Array<number>(24).fill(0)
    horas[h] += v
    porDia.set(chave, horas)
  }
  return porDia
}

/**
 * As visitas e a conversão do período, contra o de antes. `visitas` e
 * `compras`: as respostas de `perguntaDasVisitas` e `perguntaDasCompras`.
 */
export function visitasDoPeriodo(
  r: { visitas: RelatorioGa4; compras: RelatorioGa4 },
  p: Periodo,
  agora: Date
): VisitasDoPeriodo {
  const fuso = fusoDa(r.visitas)
  const hoje = diaNoFuso(agora, fuso)
  const horaAgora = horaNoFuso(agora, fuso)
  const sessoes = porDiaEHora(r.visitas)
  const compras = porDiaEHora(r.compras)

  // Até que hora o Google já somou hoje — a regra do Início (`comparacaoComOntem`): em dia, até
  // a hora de agora (sem ela, pela metade); atrasado, até a última hora com visita. Só quando o
  // período chega até agora; um período que já acabou vai inteiro.
  const deHoje = sessoes.get(hoje) ?? []
  let ultima = -1
  for (let h = 0; h <= horaAgora; h++) if ((deHoje[h] ?? 0) > 0) ultima = h
  const ate = Math.max(0, ultima >= horaAgora - 1 ? horaAgora : ultima)

  // Os dias de um lado; o último, quando o período chega até agora, só até a hora `ate`. As
  // compras cortam na mesma hora: senão, as da última hora entrariam sem as visitas dela.
  const contar = (porDia: Map<string, number[]>, dias: string[]) =>
    dias.reduce((soma, chave, i) => {
      const horas = p.ateAgora && i === dias.length - 1 ? ate : 24
      return soma + (porDia.get(chave) ?? []).slice(0, horas).reduce((s, v) => s + v, 0)
    }, 0)
  const visitas = comparar(contar(sessoes, p.dias), p.antes ? contar(sessoes, p.antes.dias) : null)
  const pedidos = comparar(contar(compras, p.dias), p.antes ? contar(compras, p.antes.dias) : null)

  const taxa = (c: number, v: number) => (v > 0 ? Math.round((c / v) * 10_000) / 100 : null)
  const valor = taxa(pedidos.valor, visitas.valor)
  const antes =
    visitas.antes === null || pedidos.antes === null ? null : taxa(pedidos.antes, visitas.antes)
  return {
    visitas,
    pedidos,
    conversao: {
      valor,
      antes,
      variacao: valor !== null && antes !== null ? variacao(valor, antes) : null,
    },
    ate: p.ateAgora && ultima >= 0 ? ate : null,
  }
}

/** O endereço da loja pros links de campanha (o `LOJA_URL`, que troca na virada); `null` sem ele. */
export function enderecoDaLoja(url: string | undefined): string | null {
  try {
    return new URL(url ?? "").origin
  } catch {
    return null
  }
}
