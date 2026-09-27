import { lerEstado, type Estado } from "./estado"

/**
 * OS PARCEIROS DE PAGAMENTO — a lista única, no backend.
 *
 * Parceiro é quem COBRA: um provedor de pagamento do Medusa (um módulo em
 * `src/modules/<parceiro>/`, registrado no `medusa-config.ts`) que grava na
 * sessão o estado comum (`./estado.ts`), cada um na sua chave de `data`.
 * Hoje, só o Pagar.me.
 *
 * ┌─ QUEM PERGUNTA AQUI, E QUEM NÃO ───────────────────────────────────────┐
 * │ Tudo que LÊ o pagamento de um pedido pergunta aqui "esta sessão é de   │
 * │ um parceiro?" e "qual é o estado dela?": os e-mails (confirmação,      │
 * │ venda nova, cancelamento, devolução), o painel, a nota fiscal, a       │
 * │ versão pública do pedido e o Marketing. Nenhum deles sabe qual         │
 * │ parceiro cobrou, e parceiro novo não muda nenhum deles.                │
 * │                                                                         │
 * │ O que FALA com o parceiro continua de cada um: o provedor, a           │
 * │ conciliação e a conferência dos estornos (`conciliar-pagamentos.ts` e  │
 * │ `estornos.ts` são do Pagar.me), o aviso (webhook) e o script que liga  │
 * │ a região.                                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A loja tem a mesma lista (`PARCEIROS`, em
 * `apps/loja/src/lib/checkout-visivel.ts`): parceiro novo entra nas duas.
 *
 * O provisório (`pp_system_default`) NÃO é parceiro: ele fecha o pedido sem
 * cobrar ("a combinar"), e nada que vale pra pagamento de verdade vale pra
 * ele — nem o e-mail de confirmação, nem o aviso de venda.
 */

export type Parceiro = {
  /** O id do provedor no Medusa: `pp_` + o identificador da classe + o id do registro. */
  id: string
  /** Como a loja chama o parceiro no painel e nos avisos. */
  nome: string
  /** Onde o parceiro grava o estado na sessão: `data[chave]`. */
  chave: string
}

export const PAGARME: Parceiro = { id: "pp_pagarme_pagarme", nome: "Pagar.me", chave: "pagarme" }

export const PARCEIROS: readonly Parceiro[] = [PAGARME]

/** O provedor que fecha o pedido sem cobrar (o "a combinar"). Não é parceiro. */
export const PROVISORIO = "pp_system_default"

export function parceiroDe(providerId: unknown): Parceiro | null {
  return PARCEIROS.find((p) => p.id === providerId) ?? null
}

/** A sessão (ou o pagamento) é de um parceiro: cobrou, ou ia cobrar, de verdade. */
export const ehParceiro = (providerId: unknown) => parceiroDe(providerId) !== null

type SessaoDeAlguem = { provider_id?: string | null; status?: string | null } | null | undefined

/**
 * A sessão que virou o pagamento: a de um parceiro que chegou mais longe
 * (autorizada ou capturada) ou, sem nenhuma assim, a última. O Medusa apaga
 * as sessões da coleção quando abre outra, então quase sempre é uma só — a
 * regra é pra quando não é.
 */
export function sessaoDoParceiro<S extends SessaoDeAlguem>(
  sessoes: readonly S[] | null | undefined
): NonNullable<S> | null {
  const nossas = (sessoes ?? []).filter((s): s is NonNullable<S> => ehParceiro(s?.provider_id))
  return (
    nossas.find((s) => s.status === "authorized" || s.status === "captured") ??
    nossas[nossas.length - 1] ??
    null
  )
}

/**
 * O estado que o parceiro gravou nesta sessão, ou null se ela não é de
 * parceiro nenhum. Só a chave DELE é lida: um `data.pagarme` numa sessão do
 * provisório (a API pública deixa qualquer um escrever no `data`) não vira
 * pagamento.
 */
export function estadoDaSessao(
  sessao: { provider_id?: string | null; data?: unknown } | null | undefined
): Estado | null {
  const parceiro = parceiroDe(sessao?.provider_id)
  if (!parceiro) return null
  return lerEstado(sessao?.data as Record<string, unknown> | null | undefined, parceiro.chave)
}
