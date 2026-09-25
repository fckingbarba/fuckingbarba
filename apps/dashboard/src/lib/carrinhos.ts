/**
 * OS CARRINHOS ABANDONADOS, como vêm do Medusa (`GET /dashboard/carrinhos`,
 * montada em `apps/backend/src/lib/painel/carrinhos.ts`): uma linha por
 * pessoa, o passo em que ela parou e o link do WhatsApp.
 */

export type Etapa = "sacola" | "contato" | "entrega" | "pagamento"
export type Filtro = "parados" | "agora" | "voltaram"

export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: "sacola", nome: "Sacola" },
  { id: "contato", nome: "Contato" },
  { id: "entrega", nome: "Entrega" },
  { id: "pagamento", nome: "Pagamento" },
]

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "parados", nome: "Parados" },
  { id: "agora", nome: "No site agora" },
  { id: "voltaram", nome: "Voltaram e compraram" },
]

export const ehFiltro = (v: unknown): v is Filtro =>
  typeof v === "string" && FILTROS.some((f) => f.id === v)

export type LinhaDoCarrinho = {
  id: string
  quando: string
  paradoEm: string
  quem: { nome: string | null; email: string | null; telefone: string | null }
  itens: string
  unidades: number
  valor: number
  etapa: Etapa
  etapaTexto: string
  situacao: Filtro
  pedido: { id: string; numero: number } | null
  whatsapp: string | null
  chamado: { quem: string; quando: string } | null
}

export type TelaDosCarrinhos = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  numeros: {
    parados: { quantos: number; valor: number }
    voltaram: { quantos: number; valor: number }
    semContato: { quantos: number; valor: number }
  }
  verContato: boolean
  carrinhos: LinhaDoCarrinho[]
}
