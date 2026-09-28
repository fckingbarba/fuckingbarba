import { soDoEndereco, variacao } from "./marketing"
import { baldeDoDia, baldesDo, type Comparado, type Periodo } from "./periodo"
import {
  diaNoFuso,
  fusoDa,
  horaNoFuso,
  origensDe,
  type Barra,
  type LinhaGa4,
  type RelatorioGa4,
} from "./visitas"

/**
 * AS VISITAS DO INÍCIO NO PERÍODO (entrega 0186) — o que o Google Analytics
 * conta no período da barra de cima: as visitas contra o período de antes
 * (e em cada balde do gráfico), o que as visitas fizeram (viram uma
 * categoria, um produto, puseram na sacola), as taxas e de onde vieram.
 *
 * Código puro, com testes (`__tests__/visitas-do-periodo.unit.spec.ts`);
 * quem pergunta é o `ga4.ts`, e quem junta as vendas é a rota
 * (`api/dashboard/visitas`).
 *
 * SÓ O ENDEREÇO DA LOJA (`hostsDaLoja`, o do Marketing). O GA4 é o mesmo
 * desde a Nuvemshop, e o domínio também: antes da virada (27/09/2026) as
 * visitas do www eram as da Nuvemshop — o período cobre as duas lojas, como
 * as vendas (`inicio-periodo.ts`).
 *
 * ┌─ O CORTE DE HOJE ──────────────────────────────────────────────────────┐
 * │ O Google soma o dia com horas de atraso. Quando o período chega até    │
 * │ agora, as visitas contam até a última hora que ele já somou hoje (a    │
 * │ regra do Início e do Marketing: `comparacaoComOntem`,                  │
 * │ `visitasDoPeriodo`), e o de antes para na mesma hora — e as vendas da  │
 * │ taxa "visitas que compraram" também (`janelasNoCorte`, em              │
 * │ `periodo.ts`). O que é só do Google (o que as visitas fizeram, a taxa  │
 * │ da sacola) não precisa de corte: as duas contas atrasam juntas.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A TAXA "VISITAS QUE COMPRARAM" DIVIDE TODAS AS VENDAS PELAS VISITAS DO
 * GOOGLE, como a Nuvemshop mostrava ("8 vendas em 420 visitas"). Quem clica
 * em "Só o necessário" compra sem virar visita, e a taxa sai um pouco acima
 * da do Marketing, que só conta as compras que o Google viu (0135) — mas
 * aquela não tem como contar a Nuvemshop (as compras de lá não são
 * "order_…"), e esta segue pelas duas lojas.
 */

export const EVENTOS_DO_INICIO = ["view_item", "add_to_cart"] as const

/** As vitrines da Nuvemshop (os endereços antigos, `redirects.json`), com as subcategorias. */
const VITRINES_DA_NUVEMSHOP = [
  "produtos-para-a-barba",
  "kits-para-barba",
  "para-o-cabelo",
  "comprar",
]

/**
 * As páginas de categoria, pro filtro do Google (RE2): a vitrine de todos os
 * produtos e a de cada categoria da loja (`/barba`), e as vitrines da
 * Nuvemshop (`/produtos-para-a-barba/`, `/produtos-para-a-barba/balm/`).
 * A página de um produto (`/produtos/<handle>`) não é categoria.
 */
export function caminhosDeCategoria(enderecos: readonly string[]): string {
  const daLoja = [
    "produtos",
    ...enderecos.filter((e) => /^[a-z0-9-]+$/.test(e) && e !== "produtos"),
  ]
  return `^/((${daLoja.join("|")})|(${VITRINES_DA_NUVEMSHOP.join("|")})(/[a-z0-9-]+)?)/?$`
}

type Filtro = Record<string, unknown>

/** Os filtros juntos (o endereço e os outros), no formato do GA4. */
function filtrados(...filtros: (Filtro | null)[]): { dimensionFilter?: Filtro } {
  const todos = filtros.filter((f): f is Filtro => f !== null)
  if (!todos.length) return {}
  return { dimensionFilter: todos.length === 1 ? todos[0] : { andGroup: { expressions: todos } } }
}

/**
 * As perguntas ao Google, numa chamada só (`relatoriosDoMarketing`, até 5):
 * 1. as visitas por dia e hora, do começo do de antes ao fim do período;
 * 2. as visitas com cada evento (`EVENTOS_DO_INICIO`), por dia, nas mesmas datas;
 * 3. as visitas que viram uma página de categoria, por dia, só no período;
 * 4. de onde vieram, só no período.
 * `completo` falso (quem não abre o Marketing): só a primeira.
 */
export function perguntasDoPeriodo(
  p: Periodo,
  hosts: string[],
  categorias: readonly string[],
  completo: boolean
): unknown[] {
  const endereco = soDoEndereco(hosts)
  const tudo = [{ startDate: p.antes?.de ?? p.de, endDate: p.ate }]
  const periodo = [{ startDate: p.de, endDate: p.ate }]
  const visitas = {
    dateRanges: tudo,
    dimensions: [{ name: "date" }, { name: "hour" }],
    metrics: [{ name: "sessions" }],
    ...filtrados(endereco),
    // Seis meses e os seis de antes, hora a hora: ~8.900 linhas.
    limit: "10000",
  }
  if (!completo) return [visitas]
  return [
    visitas,
    {
      dateRanges: tudo,
      dimensions: [{ name: "date" }, { name: "eventName" }],
      metrics: [{ name: "sessions" }],
      ...filtrados(endereco, {
        filter: { fieldName: "eventName", inListFilter: { values: [...EVENTOS_DO_INICIO] } },
      }),
      limit: "10000",
    },
    {
      dateRanges: periodo,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      ...filtrados(
        endereco,
        {
          filter: {
            fieldName: "eventName",
            stringFilter: { matchType: "EXACT", value: "page_view" },
          },
        },
        {
          filter: {
            fieldName: "pagePath",
            stringFilter: { matchType: "FULL_REGEXP", value: caminhosDeCategoria(categorias) },
          },
        }
      ),
      limit: "1000",
    },
    {
      dateRanges: periodo,
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      ...filtrados(endereco),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50",
    },
  ]
}

/* ── as respostas ─────────────────────────────────────────────────────────── */

const numero = (v: string | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const dimensao = (l: LinhaGa4, i: number) => l.dimensionValues?.[i]?.value ?? ""
const metrica = (l: LinhaGa4) => numero(l.metricValues?.[0]?.value ?? undefined)
/** "20260924" → "2026-09-24"; `null` se não for data. */
const diaDaLinha = (v: string) =>
  /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null

/**
 * Até que hora o Google já somou hoje, quando o período chega até agora: em
 * dia (a última hora com visita é a de agora ou a anterior), até a hora de
 * agora, sem ela; atrasado, até a última hora com visita, sem ela — a regra
 * do Início (`comparacaoComOntem`). 0: nada de hoje ainda. `null`: o período
 * não chega em hoje, e não há corte.
 */
export function corteDoGoogle(r: RelatorioGa4, p: Periodo, agora: Date): number | null {
  if (!p.ateAgora) return null
  const fuso = fusoDa(r)
  const hoje = diaNoFuso(agora, fuso)
  const horaAgora = horaNoFuso(agora, fuso)
  let ultima = -1
  for (const l of r.rows ?? []) {
    if (diaDaLinha(dimensao(l, 0)) !== hoje || !(metrica(l) > 0)) continue
    const h = Number(dimensao(l, 1))
    if (Number.isInteger(h) && h <= horaAgora && h > ultima) ultima = h
  }
  if (ultima < 0) return 0
  return ultima >= horaAgora - 1 ? horaAgora : ultima
}

/** Uma taxa (em %, duas casas) do período e a do de antes, e a conta: `de` em `em` ("8 vendas em 420 visitas"). */
export type Taxa = {
  valor: number | null
  antes: number | null
  variacao: number | null
  de: number
  em: number
}

export type VisitasNoPeriodo = {
  /** No corte de hoje (`ate`), dos dois lados. */
  visitas: Comparado
  /** Em cada balde do gráfico (os de `baldesDo`); o de antes, o dia inteiro, como as vendas. */
  barras: { visitas: number; antes: number | null }[]
  /** Hoje conta até esta hora, sem ela (0: nada ainda); `null` quando o período não chega em hoje. */
  ate: number | null
  /** Quem abre o Marketing: o resto. */
  comportamento?: { visitas: number; categoria: number; produto: number; sacola: number }
  taxas?: { compraram: Taxa; sacola: Taxa }
  origens?: Barra[]
  /** Quem está no site agora (o tempo real); `null` se o Google não disse. */
  agora?: number | null
}

const taxa = (de: number, em: number) => (em > 0 ? Math.round((de / em) * 10_000) / 100 : null)

function taxaComparada(
  atual: { de: number; em: number },
  antes: { de: number; em: number } | null
): Taxa {
  const valor = taxa(atual.de, atual.em)
  const deAntes = antes ? taxa(antes.de, antes.em) : null
  return {
    valor,
    antes: deAntes,
    variacao: valor !== null && deAntes !== null ? variacao(valor, deAntes) : null,
    de: atual.de,
    em: atual.em,
  }
}

/**
 * As visitas do período, pelas respostas de `perguntasDoPeriodo`. `vendas`:
 * as vendas das duas lojas no corte do Google (`janelasNoCorte`) — pra taxa
 * "visitas que compraram"; `noSite`, o tempo real.
 */
export function montarVisitasNoPeriodo(
  relatorios: RelatorioGa4[],
  p: Periodo,
  agora: Date,
  {
    vendas = null,
    noSite = null,
    completo,
  }: {
    vendas?: { atual: number; antes: number | null } | null
    noSite?: number | null
    completo: boolean
  }
): VisitasNoPeriodo {
  const [porHora = {}, porEvento = {}, categorias = {}, origens = {}] = relatorios
  const ate = corteDoGoogle(porHora, p, agora)
  const dias = new Set(p.dias)
  const diasDeAntes = new Set(p.antes?.dias ?? [])

  const barras = baldesDo(p, agora).map(() => ({
    visitas: 0,
    antes: p.antes ? 0 : (null as number | null),
  }))
  const noCorte = { atual: 0, antes: 0 }
  const inteiras = { atual: 0, antes: 0 }
  for (const l of porHora.rows ?? []) {
    const dia = diaDaLinha(dimensao(l, 0))
    const hora = Number(dimensao(l, 1))
    const v = metrica(l)
    if (!dia || !v || !Number.isInteger(hora)) continue
    // No último dia de cada lado, quando o período chega até agora, só até a hora do corte.
    const cortada = (ultimo: string) => ate !== null && dia === ultimo && hora >= ate
    if (dias.has(dia)) {
      inteiras.atual += v
      if (!cortada(p.ate)) noCorte.atual += v
      const b = barras[baldeDoDia(p, dia, hora)]
      if (b) b.visitas += v
    } else if (p.antes && diasDeAntes.has(dia)) {
      inteiras.antes += v
      if (!cortada(p.antes.ate)) noCorte.antes += v
      const b = barras[baldeDoDia(p, dia, hora, true)]
      if (b && b.antes !== null) b.antes += v
    }
  }

  const visitas: Comparado = {
    valor: noCorte.atual,
    antes: p.antes ? noCorte.antes : null,
    variacao: p.antes ? variacao(noCorte.atual, noCorte.antes) : null,
  }
  if (!completo) return { visitas, barras, ate }

  const eventos = { atual: new Map<string, number>(), antes: new Map<string, number>() }
  for (const l of porEvento.rows ?? []) {
    const dia = diaDaLinha(dimensao(l, 0))
    const lado =
      dia && dias.has(dia) ? eventos.atual : dia && diasDeAntes.has(dia) ? eventos.antes : null
    if (!lado) continue
    const nome = dimensao(l, 1)
    lado.set(nome, (lado.get(nome) ?? 0) + metrica(l))
  }
  let categoria = 0
  for (const l of categorias.rows ?? []) {
    const dia = diaDaLinha(dimensao(l, 0))
    if (dia && dias.has(dia)) categoria += metrica(l)
  }
  const sacola = eventos.atual.get("add_to_cart") ?? 0

  return {
    visitas,
    barras,
    ate,
    comportamento: {
      visitas: inteiras.atual,
      categoria,
      produto: eventos.atual.get("view_item") ?? 0,
      sacola,
    },
    taxas: {
      compraram: taxaComparada(
        { de: vendas?.atual ?? 0, em: noCorte.atual },
        p.antes && vendas && vendas.antes !== null ? { de: vendas.antes, em: noCorte.antes } : null
      ),
      sacola: taxaComparada(
        { de: sacola, em: inteiras.atual },
        p.antes ? { de: eventos.antes.get("add_to_cart") ?? 0, em: inteiras.antes } : null
      ),
    },
    origens: origensDe(origens),
    agora: noSite,
  }
}
