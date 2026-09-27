import type { Paginacao } from "@/lib/paginas"

/**
 * AS AVALIAÇÕES, do lado do painel — os tipos da tela e as fitas. Quem monta
 * a tela é o backend (`apps/backend/src/lib/painel/avaliacoes.ts`, pela
 * `GET /dashboard/avaliacoes`); aqui só se desenha.
 */

export type Filtro = "novas" | "no-site" | "recusadas"

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "novas", nome: "Novas" },
  { id: "no-site", nome: "No site" },
  { id: "recusadas", nome: "Recusadas" },
]

export const ehFiltro = (v: unknown): v is Filtro => FILTROS.some((f) => f.id === v)

export type Situacao = "nova" | "aprovada" | "recusada"

export type LinhaDaAvaliacao = {
  id: string
  nome: string
  nota: number
  texto: string
  situacao: Situacao
  produto: { nome: string; handle: string | null; foto: string | null }
  /** "hoje, 14:32" — quando a pessoa mandou. */
  quando: string
  /** Só pra quem abre os pedidos. */
  pedido: { id: string; numero: number } | null
  /** "Aprovada por Ana · ontem, 10:02". */
  moderacao: string | null
}

export type TelaDasAvaliacoes = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  noSite: { media: number | null; total: number }
  avaliacoes: LinhaDaAvaliacao[]
  paginacao?: Paginacao
}
