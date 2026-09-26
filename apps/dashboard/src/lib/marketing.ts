import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import { medusa } from "@/lib/medusa"

/**
 * O MARKETING, do lado do painel — o formato das respostas de
 * `GET /dashboard/marketing` e `GET /dashboard/marketing/visitas` (cópia dos
 * tipos de `apps/backend/src/lib/painel/marketing.ts`: quem mudar um, muda o
 * outro).
 */

/** Os períodos da tela, na ordem dos botões; sem escolha, 30 dias (o protótipo). */
export const PERIODOS = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["90d", "90 dias"],
] as const
export type Periodo = (typeof PERIODOS)[number][0]
const PERIODO_PADRAO: Periodo = "30d"

export const lerPeriodo = (v: unknown): Periodo =>
  PERIODOS.some(([p]) => p === v) ? (v as Periodo) : PERIODO_PADRAO

/** Um número do período e o do de antes; `variacao` em %, `null` sem nada antes pra comparar. */
export type Comparado = { valor: number; antes: number; variacao: number | null }

export type Barra = { rotulo: string; nome: string; valor: number; pedidos: number; agora: boolean }

export type ProdutoVendido = {
  nome: string
  imagem: string | null
  unidades: number
  receita: number
}

export type MetaDoMes = {
  mes: string
  nome: string
  valor: number | null
  feito: number
  dia: number
  dias: number
  restam: number
  ritmo: number
  projecao: number
  porDia: number | null
}

export type Resumo = {
  periodo: Periodo
  numeros: { receita: Comparado; pedidos: Comparado; ticket: Comparado }
  serie: { titulo: string; barras: Barra[] }
  maisVendidos: ProdutoVendido[]
  meta: MetaDoMes
  /** Quem pediu pode mudar a meta (o dono). */
  mudaAMeta: boolean
}

export type Conversao = { valor: number | null; antes: number | null; variacao: number | null }

export type VisitasDoPeriodo = {
  visitas: Comparado
  pedidos: Comparado
  conversao: Conversao
  /** As visitas de hoje contam até esta hora (o Google soma com atraso); `null`: nada de hoje ainda. */
  ate: number | null
}

export type RespostaDasVisitas =
  ({ estado: "ok" } & VisitasDoPeriodo) | { estado: "desligado" | "invalida" | "recusado" | "fora" }

export type LeituraDoResumo = { estado: "ok"; resumo: Resumo } | { estado: "sem-acesso" | "fora" }

export async function lerResumo(periodo: Periodo): Promise<LeituraDoResumo> {
  const r = await medusa(`/dashboard/marketing?periodo=${periodo}`, {
    metodo: "GET",
    token: "sessao",
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { estado: "sem-acesso" }
  if (r.status !== 200) return { estado: "fora" }
  return { estado: "ok", resumo: r.corpo as unknown as Resumo }
}

/**
 * As visitas e a conversão do período — do Google, numa pergunta à parte:
 * quem chama põe num `<Suspense>`, e o resto do Resumo não espera por ele.
 * Uma pergunta por página (`cache` do React), pros dois números que usam.
 */
export const lerVisitasDoMarketing = cache(
  async (periodo: Periodo): Promise<RespostaDasVisitas> => {
    const r = await medusa(`/dashboard/marketing/visitas?periodo=${periodo}`, {
      metodo: "GET",
      token: "sessao",
    })
    const estado = r.corpo.estado
    if (r.status === 200 && estado === "ok")
      return r.corpo as unknown as { estado: "ok" } & VisitasDoPeriodo
    if (
      r.status === 200 &&
      (estado === "desligado" || estado === "invalida" || estado === "recusado")
    )
      return { estado }
    return { estado: "fora" }
  }
)
