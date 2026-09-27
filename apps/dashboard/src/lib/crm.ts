import "server-only"
import { redirect } from "next/navigation"
import { medusa } from "@/lib/medusa"

/**
 * O CRM DO PAINEL, do lado do painel — a leitura da tela (`GET /dashboard/crm`).
 * A conta mora no backend (`apps/backend/src/lib/painel/crm.ts`); aqui, os
 * tipos e a pergunta.
 */

/** Os períodos da tela, na ordem dos botões; sem escolha, 7 dias. */
export const PERIODOS_DO_CRM = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
] as const
export type PeriodoDoCrm = (typeof PERIODOS_DO_CRM)[number][0]

export const lerPeriodoDoCrm = (v: unknown): PeriodoDoCrm =>
  PERIODOS_DO_CRM.some(([p]) => p === v) ? (v as PeriodoDoCrm) : "7d"

export type TipoDoCrm =
  | "visita"
  | "produto_visto"
  | "sacola_entrou"
  | "sacola_saiu"
  | "checkout_comecou"
  | "contato_informado"
  | "entrega_escolhida"
  | "pagamento_escolhido"
  | "pix_copiado"
  | "newsletter"
  | "conta_entrou"

/** Os e-mails de cliente que saíram no período, e quantos deles… */
export type NumerosDosEmails = {
  enviados: number
  entregues: number
  abertos: number
  clicados: number
  naoChegaram: number
  reclamacoes: number
}

/** O que os avisos do Resend contaram (`montarEmailsDoCrm`, no backend). */
export type EmailsDaTela = {
  ligados: boolean
  ultimoAviso: string | null
  numeros: NumerosDosEmails
  porTipo: (NumerosDosEmails & { tipo: string | null; nome: string })[]
  ultimos: {
    id: string
    quando: string
    quem: string | null
    oque: string
    nivel: "bom" | "ruim" | null
  }[]
}

export type TelaDoCrm = {
  periodo: PeriodoDoCrm
  numeros: { visitantes: number; identificados: number; pessoas: number; anotacoes: number }
  tipos: { tipo: TipoDoCrm; nome: string; vezes: number; visitantes: number }[]
  ultimos: { id: string; tipo: TipoDoCrm; quando: string; quem: string | null; oque: string }[]
  emails: EmailsDaTela
}

export type LeituraDoCrm =
  { estado: "ok"; tela: TelaDoCrm } | { estado: "sem-acesso" } | { estado: "fora" }

export async function lerTelaDoCrm(periodo: PeriodoDoCrm): Promise<LeituraDoCrm> {
  const r = await medusa(`/dashboard/crm?periodo=${periodo}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { estado: "sem-acesso" }
  if (r.status !== 200) return { estado: "fora" }
  return { estado: "ok", tela: r.corpo as unknown as TelaDoCrm }
}
