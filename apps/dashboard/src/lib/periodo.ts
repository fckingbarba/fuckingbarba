import type { LinhaDaLista } from "@/lib/pedidos"

/**
 * O PERÍODO, do lado do painel — o do Início (entrega 0186) e o do Marketing
 * (0191): os botões da barra de cima, o endereço de cada um e o formato do
 * que o Medusa responde (cópia dos tipos de
 * `apps/backend/src/lib/painel/inicio-periodo.ts`, `periodo.ts` e
 * `visitas-do-periodo.ts`: quem mudar um, muda o outro).
 *
 * O período mora no endereço (`/?periodo=ontem`, `/marketing?de=…&ate=…`, e
 * `&comparar=nenhum`): o voltar do navegador volta pro de antes, e o link
 * pode ser mandado pra alguém. Quem decide o que cada um quer dizer é o
 * backend; o painel só repassa e desenha o que veio.
 */

/** Os botões, na ordem da barra. */
export const ATALHOS = [
  ["hoje", "Hoje"],
  ["ontem", "Ontem"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["90d", "90 dias"],
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
] as const
export type Atalho = (typeof ATALHOS)[number][0]
export type Atalhos = readonly (readonly [Atalho, string])[]

/** Os do Início, o desenho aprovado: sem os 90 dias (que o Marketing já tinha). */
export const ATALHOS_DO_INICIO: Atalhos = ATALHOS.filter(([a]) => a !== "90d")

/** O que o endereço pode trazer. */
export type BuscaDoPeriodo = { periodo?: string; de?: string; ate?: string; comparar?: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * O pedido pro Medusa: as datas (se as duas parecem data), ou o botão; sem
 * nada, o `padrao` da tela (o Início, "hoje"; o Marketing, "30d"). O
 * `comparar` vai só quando é "nenhum". O backend confere de novo e diz o
 * que valeu.
 */
export function consultaDoPeriodo(busca: BuscaDoPeriodo, padrao: Atalho = "hoje"): string {
  const q = new URLSearchParams()
  const de = texto(busca.de)
  const ate = texto(busca.ate)
  if (DIA.test(de) && DIA.test(ate)) {
    q.set("de", de)
    q.set("ate", ate)
  } else {
    const pedido = texto(busca.periodo)
    q.set("periodo", ATALHOS.some(([a]) => a === pedido) ? pedido : padrao)
  }
  if (texto(busca.comparar) === "nenhum") q.set("comparar", "nenhum")
  return q.toString()
}

/** O endereço de uma tela (`caminho`) com um período (o botão, ou as datas) e o comparar. */
export function enderecoDoPeriodo(
  caminho: string,
  periodo: { atalho: Atalho | null; de: string; ate: string },
  comparar: boolean
): string {
  const q = new URLSearchParams()
  if (periodo.atalho) q.set("periodo", periodo.atalho)
  else {
    q.set("de", periodo.de)
    q.set("ate", periodo.ate)
  }
  if (!comparar) q.set("comparar", "nenhum")
  return `${caminho}?${q.toString()}`
}

/** O endereço do Início com um período e o comparar. */
export const enderecoDoInicio = (
  periodo: { atalho: Atalho | null; de: string; ate: string },
  comparar: boolean
) => enderecoDoPeriodo("/", periodo, comparar)

/* ── o que o Medusa responde ──────────────────────────────────────────────── */

export type Comparado = { valor: number; antes: number | null; variacao: number | null }

export type PeriodoNaTela = {
  atalho: Atalho | null
  de: string
  ate: string
  ateAgora: boolean
  passo: "hora" | "dia" | "semana"
  /** "Hoje", "Ontem", "Últimos 7 dias", "Este mês", "Agosto", "14/09 a 20/09". */
  nome: string
  /** "domingo, 27/09" ou "22/09 a 28/09". */
  datas: string
  /** "ontem", "26/09", "07/09 a 13/09", "julho"; `null` sem comparar. */
  nomeDoAntes: string | null
  /** Por que o período pedido não valeu (e virou o padrão da tela). */
  aviso: string | null
  comparar: boolean
  antesDe: string | null
  antesAte: string | null
}

export type BarraDoPeriodo = {
  rotulo: string
  nome: string
  agora: boolean
  pedidos: number
  receita: number
  antes: { pedidos: number; receita: number } | null
}

export type PassoDoCheckout = { nome: string; n: number; taxa: number | null; pior: boolean }

export type InicioNoPeriodo = {
  periodo: PeriodoNaTela
  vendas: Comparado
  receita: Comparado
  ticket: Comparado
  barras: BarraDoPeriodo[]
  maisVendidos: { nome: string; imagem: string | null; unidades: number }[]
  /** Quantas vendas do período vieram da Nuvemshop. */
  daNuvemshop: number
  /** Só pra quem abre o Marketing. */
  checkout: PassoDoCheckout[] | null
  /** O mesmo checkout no período de antes; `null` sem comparar. */
  checkoutAntes: PassoDoCheckout[] | null
  /** Só pra quem abre os Pedidos. */
  pedidos: { lista: LinhaDaLista[]; total: number } | null
}

/** Uma taxa em % (duas casas) e a conta: `de` em `em` ("8 vendas em 420 visitas"). */
export type Taxa = {
  valor: number | null
  antes: number | null
  variacao: number | null
  de: number
  em: number
  /** Só na "visitas que compraram": as vendas do período inteiro, sem o corte. */
  noPeriodo?: number
}

export type VisitasNoPeriodo = {
  visitas: Comparado
  barras: { visitas: number; antes: number | null }[]
  /** Hoje conta até esta hora, sem ela (0: nada ainda); `null`: sem corte. */
  ate: number | null
  comportamento?: { visitas: number; categoria: number; produto: number; sacola: number }
  taxas?: { compraram: Taxa; sacola: Taxa }
  origens?: { nome: string; visitas: number }[]
  agora?: number | null
}
