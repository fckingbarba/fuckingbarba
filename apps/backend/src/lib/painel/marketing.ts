import { numeroBrasileiro } from "../cupons"
import { chaveDoDia, dia, diaDaSemana } from "./formato"
import { nomeCurto, pagamentoDo, totalDo, type PedidoCru } from "./pedido"
import { diaNoFuso, fusoDa, horaNoFuso, type RelatorioGa4 } from "./visitas"

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
 * ┌─ O PERÍODO E O DE ANTES ───────────────────────────────────────────────┐
 * │ "7 dias" são os 6 dias inteiros de antes e o hoje até agora. O de antes│
 * │ é o mesmo tanto de tempo, terminando na mesma hora de 7 dias atrás: o  │
 * │ hoje pela metade não compete com um dia inteiro. "Hoje" é contra ontem │
 * │ até a mesma hora.                                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * AS VISITAS SÃO DO GOOGLE, com o atraso dele (horas — ver `visitas.ts`):
 * as de hoje contam até a hora que ele já somou, e o período de antes, até
 * a mesma hora. A conversão (pedidos pagos ÷ visitas) usa o mesmo corte nos
 * pedidos: senão, os pedidos da última hora entrariam sem as visitas dela.
 * E só as visitas do endereço da loja (`hostsDaLoja`): o Analytics é o
 * mesmo do site antigo, da Nuvemshop, que segue no ar até a virada.
 */

const FUSO = "America/Sao_Paulo"
const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

export const PERIODOS = ["hoje", "7d", "30d", "90d"] as const
export type Periodo = (typeof PERIODOS)[number]
/** O que a tela abre sem escolha (o protótipo): um dia só é pouco pra concluir. */
export const PERIODO_PADRAO: Periodo = "30d"

const DIAS: Record<Periodo, number> = { hoje: 1, "7d": 7, "30d": 30, "90d": 90 }
/** Quantos dias o período tem (o hoje conta como um). */
export const diasDo = (p: Periodo) => DIAS[p]

export const lerPeriodo = (v: unknown): Periodo =>
  (PERIODOS as readonly unknown[]).includes(v) ? (v as Periodo) : PERIODO_PADRAO

const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const centavos = (v: number) => Math.round(v * 100) / 100

/* ── os dias, no fuso da loja ─────────────────────────────────────────────── */

/** "2026-09-24" mais `n` dias: "2026-09-25", "2026-09-23"… */
export const somarDias = (chave: string, n: number) =>
  new Date(Date.parse(`${chave}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)

/** A meia-noite de um dia ("2026-09-24") no fuso dado, como instante. */
export function meiaNoite(chave: string, fuso = FUSO): Date {
  const utc = Date.parse(`${chave}T00:00:00Z`)
  const nome =
    new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  // "GMT-03:00" em Brasília ("GMT" sozinho é o UTC). Se o horário de verão voltar, o Intl sabe.
  const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(nome)
  const minutos = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  return new Date(utc - minutos * 60_000)
}

export type Janela = { de: Date; ate: Date }

export const dentro = (d: Date, j: Janela) => d >= j.de && d < j.ate

/** O período (do começo do primeiro dia até agora), os dias dele e o de antes, do mesmo tamanho. */
export function janelasDo(periodo: Periodo, agora: Date) {
  const n = DIAS[periodo]
  const hoje = chaveDoDia(agora)
  const dias = Array.from({ length: n }, (_, i) => somarDias(hoje, i - n + 1))
  return {
    dias,
    atual: { de: meiaNoite(dias[0]), ate: agora } as Janela,
    antes: {
      de: meiaNoite(somarDias(dias[0], -n)),
      ate: new Date(agora.getTime() - n * DIA_MS),
    } as Janela,
  }
}

export const mesDe = (agora: Date) => chaveDoDia(agora).slice(0, 7)

/**
 * Desde quando ler os pedidos: o começo do período de antes, ou o do mês (a
 * meta), o que vier primeiro — com três dias de folga, pro pedido feito antes
 * e pago dentro (o cartão que ficou em análise).
 */
export function lerPedidosDesde(periodo: Periodo, agora: Date): Date {
  const { antes } = janelasDo(periodo, agora)
  const mes = meiaNoite(`${mesDe(agora)}-01`)
  return new Date(Math.min(antes.de.getTime(), mes.getTime()) - 3 * DIA_MS)
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

/** Um número do período e o do de antes; `variacao` em %, `null` sem nada antes pra comparar. */
export type Comparado = { valor: number; antes: number; variacao: number | null }

export const variacao = (agora: number, antes: number): number | null =>
  antes > 0 ? Math.round(((agora - antes) / antes) * 100) : null

const comparar = (valor: number, antes: number): Comparado => ({
  valor,
  antes,
  variacao: variacao(valor, antes),
})

/** A receita e os pedidos pagos numa janela. */
export function somaNa(vendas: Venda[], j: Janela) {
  const nela = vendas.filter((v) => dentro(v.pagoEm, j))
  return { receita: centavos(nela.reduce((s, v) => s + v.total, 0)), pedidos: nela.length }
}

export type NumerosDoPeriodo = { receita: Comparado; pedidos: Comparado; ticket: Comparado }

export function numerosDo(
  vendas: Venda[],
  janelas: { atual: Janela; antes: Janela }
): NumerosDoPeriodo {
  const agora = somaNa(vendas, janelas.atual)
  const antes = somaNa(vendas, janelas.antes)
  const ticket = (s: { receita: number; pedidos: number }) =>
    s.pedidos ? centavos(s.receita / s.pedidos) : 0
  return {
    receita: comparar(agora.receita, antes.receita),
    pedidos: comparar(agora.pedidos, antes.pedidos),
    ticket: comparar(ticket(agora), ticket(antes)),
  }
}

/* ── a receita no tempo ───────────────────────────────────────────────────── */

/**
 * Uma barra do gráfico: `rotulo` embaixo (vazio pra não amontoar), `nome` o
 * completo ("24/09", "9h", "07/09 a 13/09"), e `agora` a de hoje (ou desta hora).
 */
export type Barra = { rotulo: string; nome: string; valor: number; pedidos: number; agora: boolean }
export type Serie = { titulo: string; barras: Barra[] }

export function serieDo(
  periodo: Periodo,
  vendas: Venda[],
  janelas: { dias: string[]; atual: Janela },
  agora: Date
): Serie {
  const nela = vendas.filter((v) => dentro(v.pagoEm, janelas.atual))
  const somar = (b: Barra, v: Venda) => {
    b.valor = centavos(b.valor + v.total)
    b.pedidos++
  }

  if (periodo === "hoje") {
    const h = horaNoFuso(agora, FUSO)
    const barras = Array.from({ length: h + 1 }, (_, i) => ({
      rotulo: i === h ? "agora" : i % 6 === 0 ? `${i}h` : "",
      nome: `${i}h`,
      valor: 0,
      pedidos: 0,
      agora: i === h,
    }))
    for (const v of nela) {
      const b = barras[horaNoFuso(v.pagoEm, FUSO)]
      if (b) somar(b, v)
    }
    return { titulo: "Receita por hora, hoje", barras }
  }

  const { dias } = janelas
  const porDia = new Map<string, Barra>(
    dias.map((chave, i) => {
      const d = meiaNoite(chave)
      const ultimo = i === dias.length - 1
      const rotulo = ultimo
        ? "hoje"
        : periodo === "7d"
          ? `${diaDaSemana(d)} ${dia(d).slice(0, 2)}`
          : i % 7 === 0 && i < dias.length - 3
            ? dia(d)
            : ""
      return [chave, { rotulo, nome: dia(d), valor: 0, pedidos: 0, agora: ultimo }]
    })
  )
  for (const v of nela) {
    const b = porDia.get(chaveDoDia(v.pagoEm))
    if (b) somar(b, v)
  }
  if (periodo !== "90d")
    return {
      titulo: `Receita por dia, nos últimos ${dias.length} dias`,
      barras: [...porDia.values()],
    }

  // 90 dias: por semana, de 7 em 7 contando de hoje pra trás (a mais velha fica com o que sobrar).
  const semanas: Barra[] = []
  for (let fim = dias.length; fim > 0; fim -= 7) {
    const doGrupo = dias.slice(Math.max(0, fim - 7), fim)
    const primeiro = porDia.get(doGrupo[0])!
    const ultimo = porDia.get(doGrupo[doGrupo.length - 1])!
    semanas.unshift({
      rotulo: "",
      nome: `${primeiro.nome} a ${ultimo.nome}`,
      valor: centavos(doGrupo.reduce((s, c) => s + porDia.get(c)!.valor, 0)),
      pedidos: doGrupo.reduce((s, c) => s + porDia.get(c)!.pedidos, 0),
      agora: fim === dias.length,
    })
  }
  semanas.forEach((s, i) => {
    s.rotulo = s.agora ? "esta" : i % 3 === 0 && i < semanas.length - 2 ? s.nome.slice(0, 5) : ""
  })
  return { titulo: "Receita por semana, nos últimos 90 dias", barras: semanas }
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
  periodo: Periodo
  numeros: NumerosDoPeriodo
  serie: Serie
  maisVendidos: ProdutoVendido[]
  meta: MetaDoMes
}

export function montarResumo(
  periodo: Periodo,
  pedidos: PedidoCru[],
  metas: Metas,
  agora: Date
): Resumo {
  const vendas = vendasDos(pedidos)
  const janelas = janelasDo(periodo, agora)
  return {
    periodo,
    numeros: numerosDo(vendas, janelas),
    serie: serieDo(periodo, vendas, janelas, agora),
    maisVendidos: maisVendidosNo(vendas, janelas.atual),
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

/** O período inteiro, pro GA4: do primeiro dia até hoje, no fuso da propriedade. */
export const datasDo = (periodo: Periodo) => [
  { startDate: `${DIAS[periodo] - 1}daysAgo`, endDate: "today" },
]

/** A pergunta ao GA4: as visitas por dia e hora, do período e do de antes. */
export function perguntaDasVisitas(periodo: Periodo, hosts: string[]) {
  const n = DIAS[periodo]
  const endereco = soDoEndereco(hosts)
  return {
    dateRanges: [{ startDate: `${2 * n - 1}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }, { name: "hour" }],
    metrics: [{ name: "sessions" }],
    ...(endereco ? { dimensionFilter: endereco } : {}),
    // 90 dias e os 90 de antes, hora a hora: 4.320 linhas.
    limit: "10000",
  }
}

export type Conversao = { valor: number | null; antes: number | null; variacao: number | null }

export type VisitasDoPeriodo = {
  visitas: Comparado
  /** Os pedidos pagos no mesmo corte das visitas: é o que a conversão divide. */
  pedidos: Comparado
  /** De cada 100 visitas, quantas viraram pedido pago (duas casas). */
  conversao: Conversao
  /** As visitas de hoje contam até esta hora (sem ela); `null` enquanto o Google não somou nada de hoje. */
  ate: number | null
}

export function visitasDoPeriodo(
  r: RelatorioGa4,
  periodo: Periodo,
  vendas: Venda[],
  agora: Date
): VisitasDoPeriodo {
  const n = DIAS[periodo]
  const fuso = fusoDa(r)
  const hoje = diaNoFuso(agora, fuso)
  const horaAgora = horaNoFuso(agora, fuso)

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
  const doDia = (chave: string, ate = 24) =>
    (porDia.get(chave) ?? []).slice(0, ate).reduce((s, v) => s + v, 0)

  // Até que hora o Google já somou hoje — a regra do Início (`comparacaoComOntem`): em dia, até
  // a hora de agora (sem ela, pela metade); atrasado, até a última hora com visita.
  const deHoje = porDia.get(hoje) ?? []
  let ultima = -1
  for (let h = 0; h <= horaAgora; h++) if ((deHoje[h] ?? 0) > 0) ultima = h
  const ate = Math.max(0, ultima >= horaAgora - 1 ? horaAgora : ultima)

  const contar = (ultimoDia: string) => {
    let soma = doDia(ultimoDia, ate)
    for (let i = 1; i < n; i++) soma += doDia(somarDias(ultimoDia, -i))
    return soma
  }
  const visitas = comparar(contar(hoje), contar(somarDias(hoje, -n)))

  // Os pedidos no mesmo corte: do começo do período até a hora `ate` de hoje.
  const corte = new Date(meiaNoite(hoje, fuso).getTime() + ate * HORA_MS)
  const de = meiaNoite(somarDias(hoje, 1 - n), fuso)
  const pedidos = comparar(
    somaNa(vendas, { de, ate: corte }).pedidos,
    somaNa(vendas, {
      de: new Date(de.getTime() - n * DIA_MS),
      ate: new Date(corte.getTime() - n * DIA_MS),
    }).pedidos
  )

  const taxa = (p: number, v: number) => (v > 0 ? Math.round((p / v) * 10_000) / 100 : null)
  const valor = taxa(pedidos.valor, visitas.valor)
  const antes = taxa(pedidos.antes, visitas.antes)
  return {
    visitas,
    pedidos,
    conversao: {
      valor,
      antes,
      variacao: valor !== null && antes !== null ? variacao(valor, antes) : null,
    },
    ate: ultima < 0 ? null : ate,
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
