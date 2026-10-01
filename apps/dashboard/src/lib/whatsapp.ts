import type { Route } from "next"
import type { Paginacao } from "@/lib/paginas"

/**
 * O WHATSAPP, do lado do painel — os tipos das telas, as fitas e os
 * endereços. Quem monta é o backend (`apps/backend/src/lib/painel/whatsapp.ts`
 * e `ler-whatsapp.ts`, pelas rotas `/dashboard/whatsapp`); aqui só se desenha.
 */

export type FiltroDoWhatsapp = "todas" | "equipe" | "atendente"

export const FILTROS: { id: FiltroDoWhatsapp; nome: string }[] = [
  { id: "todas", nome: "Todas" },
  { id: "equipe", nome: "Com a equipe" },
  { id: "atendente", nome: "Atendente" },
]

export const ehFiltro = (v: unknown): v is FiltroDoWhatsapp => FILTROS.some((f) => f.id === v)

/** Um id de conversa do Medusa: `wcon_` e um ULID. Nada mais vai pra API. */
export const ehIdDeConversa = (v: string) => /^wcon_[0-9A-Z]{20,40}$/.test(v)

export type LinhaDaConversa = {
  id: string
  nome: string
  telefone: string
  quando: string
  ultima: string
  situacao: "bot" | "equipe"
  motivo: string | null
  esperando: boolean
  comprou: string | null
}

export type TelaDoWhatsapp = {
  filtro: FiltroDoWhatsapp
  busca: string | null
  contagem: Record<FiltroDoWhatsapp, number>
  numeros: {
    esperando: number
    esperandoHa: string | null
    conversasHoje: number
    respostasHoje: number
    vendas: { total: string; pedidos: number }
    custoHoje: string
    custoPorResposta: string | null
  }
  ligado: boolean
  falta: string[]
  conversas: LinhaDaConversa[]
  paginacao?: Paginacao
}

export type MensagemNaTela = {
  id: string
  autor: "cliente" | "bot" | "equipe"
  texto: string
  hora: string
  diaChave: string
  dia: string
  ferramentas: string[]
  situacao: string | null
  erro: string | null
  separada: boolean
  quem: string | null
}

export type ConversaNaTela = {
  id: string
  nome: string
  telefone: string
  situacao: "bot" | "equipe"
  motivo: string | null
  janelaAte: string | null
  mensagens: MensagemNaTela[]
  quem: {
    cliente: boolean
    pedidos: number
    ficha: string | null
    tratamento: string | null
    reposicao: string | null
    ultimoPedido: {
      numero: number
      situacao: string
      itens: string
      total: string | null
      href: string
    } | null
  }
}

export type AjustesDoWhatsapp = {
  ligado: boolean
  regras: string | null
  limite: number
  falta: string[]
}

export type FalaDoTeste = { de: "cliente" | "atendente"; texto: string }

export type RespostaDoTeste = {
  texto: string
  extras: string[]
  ferramentas: string[]
  equipe: string | null
  ms: number
  custo: string
  sabia: string
}

/** O endereço da lista (ou de uma conversa), com a fita, a busca e a página de agora. */
export function enderecoDoWhatsapp(
  p: { filtro?: FiltroDoWhatsapp; busca?: string | null; pagina?: number; conversa?: string } = {}
): Route {
  const q = new URLSearchParams()
  if (p.filtro && p.filtro !== "todas") q.set("filtro", p.filtro)
  if (p.busca) q.set("busca", p.busca)
  if (p.pagina && p.pagina > 1) q.set("pagina", String(p.pagina))
  const s = q.toString()
  const base = p.conversa ? `/whatsapp/${p.conversa}` : "/whatsapp"
  return (s ? `${base}?${s}` : base) as Route
}

/** As situações da mensagem que sai, em frase curta. */
export const SITUACAO_DA_MENSAGEM: Record<string, string> = {
  enviada: "enviada",
  entregue: "entregue",
  lida: "lida",
  falhou: "não saiu",
}
