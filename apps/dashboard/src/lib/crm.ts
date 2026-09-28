import "server-only"
import { redirect } from "next/navigation"
import { ler } from "@/lib/medusa"

/**
 * O CRM DO PAINEL, do lado do painel — a leitura da tela (`GET /dashboard/crm`)
 * e os tipos dos Ajustes (`GET /dashboard/crm/ajustes`). A conta mora no
 * backend (`apps/backend/src/lib/painel/crm.ts` e `lib/crm/ajustes.ts`); aqui,
 * os tipos e a pergunta.
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

/** Uma das cinco etiquetas da pessoa, na ficha do cliente (`montarFichaDoCrm`, no backend). */
export type EtiquetaDaFicha = {
  chave: "etapa" | "engajamento" | "tratamento" | "proxima" | "cupom"
  nome: string
  valor: string
  porque: string
  tom: "bom" | "ruim" | null
}

/** A parte do CRM na ficha do cliente: as etiquetas, de onde chegou e o caminho. */
export type FichaDoCrm = {
  etiquetas: EtiquetaDaFicha[]
  /** "Instagram (black) · primeira visita em 12/09". */
  origem: string | null
  caminho: {
    id: string
    /** O tipo da anotação, "email" ou "pedido". */
    tipo: string
    quando: string
    oque: string
    nivel: "bom" | "ruim" | null
  }[]
}

export type LeituraDoCrm =
  { estado: "ok"; tela: TelaDoCrm } | { estado: "sem-acesso" } | { estado: "fora" }

/** O endereço da tela no Medusa — a página pede cedo (`void ler(...)`) e o miolo lê a mesma resposta. */
export const caminhoDoCrm = (periodo: PeriodoDoCrm) => `/dashboard/crm?periodo=${periodo}`

export async function lerTelaDoCrm(periodo: PeriodoDoCrm): Promise<LeituraDoCrm> {
  const r = await ler(caminhoDoCrm(periodo))
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { estado: "sem-acesso" }
  if (r.status !== 200) return { estado: "fora" }
  return { estado: "ok", tela: r.corpo as unknown as TelaDoCrm }
}

/* ── os Ajustes do CRM ───────────────────────────────────────────────────── */

export const CAMINHO_DOS_AJUSTES = "/dashboard/crm/ajustes"

/** Os tipos de produto (`COMPONENTES`, no backend). */
export type TipoDeProduto = "fator" | "oleo" | "shampoo" | "balm" | "spray" | "pasta"

/** As regras das etiquetas (`RegrasDasEtiquetas`, no backend). */
export type RegraDoCrm =
  "toleranciaDaReposicao" | "semPrevisao" | "sunset" | "quente" | "morno" | "comprasDoCupom"

export type AjustesDoCrm = {
  dias: Record<TipoDeProduto, number>
  regras: Record<RegraDoCrm, number>
}

/** A tela dos Ajustes (`montarTelaDosAjustes`, no backend). */
export type TelaDosAjustes = {
  ajustes: AjustesDoCrm
  padrao: AjustesDoCrm
  tipos: { tipo: TipoDeProduto; nome: string; produtos: string[] }[]
  foraDaConta: string[]
  /** Quanto tempo leva pra comprar de novo, pela loja antiga — nulo sem a base. */
  nuvemshop: Record<TipoDeProduto, { dias: number; recompras: number } | null> | null
}

/** O formulário como a tela manda: o texto de cada campo (quem confere é o Medusa). */
export type FormularioDosAjustes = {
  dias: Record<TipoDeProduto, string>
  regras: Record<RegraDoCrm, string>
}

/* ── os fluxos ──────────────────────────────────────────────────────────── */

export const CAMINHO_DOS_FLUXOS = "/dashboard/crm/fluxos"

export type IdDoFluxo = "pix" | "checkout" | "carrinho" | "boas-vindas"

/** A aba Fluxos (`GET /dashboard/crm/fluxos`, `lib/painel/fluxos.ts` no backend). */
export type TelaDosFluxos = {
  desconto: number
  limites: [number, number]
  dias: number
  fluxos: {
    id: IdDoFluxo
    nome: string
    ligado: boolean
    /** "27/09, 20:15" — desde quando vale; null se ainda não rodou ligado. */
    desde: string | null
    toques: { id: string; nome: string; quando: string; cupom: boolean; enviados: number }[]
    numeros: {
      pessoas: number
      enviados: number
      cupons: number
      cuponsUsados: number
      compraram: number
      vendido: number
      controle: { pessoas: number; compraram: number }
    }
  }[]
}

/* ── o modelo dos e-mails ────────────────────────────────────────────────── */

export const CAMINHO_DOS_EMAILS = "/dashboard/crm/emails"

/** A aba E-mails (`GET /dashboard/crm/emails`): os exemplos já montados. */
export type TelaDosEmails = {
  /** Sem o `LOJA_URL` no Medusa: os links não teriam pra onde ir. */
  semLoja: boolean
  /** Pra quem vai o teste: o e-mail de quem está no painel. */
  para: string
  remetente: string
  /** Se o "cancelar inscrição" de um clique (Gmail, iPhone) vai no cabeçalho. */
  umClique: boolean
  exemplos: { id: string; nome: string; assunto: string; previa: string; html: string }[]
}

/* ── a base da Nuvemshop ─────────────────────────────────────────────────── */

export const CAMINHO_DA_BASE = "/dashboard/crm/base"

export type EtapaDoCrm =
  "lead" | "primeira-compra" | "em-tratamento" | "recorrente" | "em-risco" | "sunset"

/** A aba da base (`montarTelaDaBase`, no backend). */
export type TelaDaBase = {
  vazia: boolean
  numeros: {
    pessoas: number
    aceitam: number
    pedidos: number
    pagos: number
    vendido: number
    carrinhos: number
    primeiroPedido: string | null
    ultimoPedido: string | null
    importadoEm: string | null
  }
  etapas: { etapa: EtapaDoCrm; nome: string; pessoas: number; aceitam: number }[]
  engajamento: {
    valor: "quente" | "morno" | "frio"
    nome: string
    pessoas: number
    aceitam: number
  }[]
}
