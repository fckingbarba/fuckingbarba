import type { Paginacao } from "@/lib/paginas"

/**
 * OS CRIADORES, do lado do painel — os tipos da tela e as fitas. Quem monta a
 * tela é o backend (`apps/backend/src/lib/painel/criadores.ts`, pela
 * `GET /dashboard/criadores`); aqui só se desenha.
 */

export type Filtro = "novas" | "aprovadas" | "recusadas"

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "novas", nome: "Novas" },
  { id: "aprovadas", nome: "Aprovadas" },
  { id: "recusadas", nome: "Recusadas" },
]

export const ehFiltro = (v: unknown): v is Filtro => FILTROS.some((f) => f.id === v)

export type Situacao = "nova" | "aprovada" | "recusada"

export type Modelo = "fixo" | "comissao" | "conversar"

export type LinhaDoCriador = {
  id: string
  nome: string
  /** "(47) 99999-0000" e o link do WhatsApp com a mensagem pronta. */
  whatsapp: { texto: string; link: string }
  email: string
  cidade: string
  perfis: { rede: "Instagram" | "TikTok"; arroba: string; link: string }[]
  /** "1 mil a 10 mil seguidores", ou nada. */
  seguidores: string | null
  barba: string
  experiencia: string | null
  video: string | null
  parceria: boolean
  modelo: { id: string; nome: string }
  situacao: Situacao
  /** "hoje, 14:32" — quando a pessoa mandou (a última vez). */
  quando: string
  /** "Aprovada por Ana · ontem, 10:02". */
  decisao: string | null
}

export type TelaDosCriadores = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  /** Das novas e das aprovadas: quantas querem cada modelo. */
  modelos: Record<Modelo, number>
  /** O link da página `/criadores`, pro "Copiar o link" (`null` sem `LOJA_URL` no Medusa). */
  pagina: string | null
  inscricoes: LinhaDoCriador[]
  paginacao?: Paginacao
}
