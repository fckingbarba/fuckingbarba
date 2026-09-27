import { emCentavos } from "./comum"

/**
 * O PAGAMENTO COBRA O CARRINHO INTEIRO? — conferido no fechamento, dentro da
 * trava do carrinho (`workflows/hooks/valor-do-pagamento.ts`).
 *
 * ┌─ O BURACO QUE ISTO FECHA (auditoria de 27/09) ─────────────────────────┐
 * │ O Medusa abre a sessão de pagamento com o valor que a coleção tinha    │
 * │ NAQUELA HORA (`createPaymentSessionsWorkflow`, sem a trava do          │
 * │ carrinho), e no fechamento autoriza o valor DA SESSÃO — o próprio core │
 * │ avisa que não compara com o total (`completeCartWorkflow`). Abrir a    │
 * │ sessão no mesmo instante em que o carrinho cresce deixa uma sessão com │
 * │ o valor de antes, que a conta nova da coleção não apaga (ela só apaga  │
 * │ as sessões que já tinha listado): um pedido de R$ 1.010 fechava com um │
 * │ Pix de R$ 10. Tentar não custa nada a quem tenta — só se paga depois   │
 * │ de ver que "pegou".                                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Na loja isso não acontece sem querer: o `finalizar` abre a sessão logo
 * antes de fechar, e mudar o carrinho no meio refaz a coleção e apaga as
 * sessões. Então o valor diferente é quase sempre alguém de propósito — e,
 * quando não é (a outra aba mudou o carrinho naquele segundo), recusar é o
 * certo do mesmo jeito: a pessoa confere o resumo e fecha de novo.
 *
 * As sessões conferidas são as que o fechamento pode autorizar — a mesma
 * lista do Medusa (`validateCartPaymentsStep`). Carrinho de total zero (o
 * cupom de 100%) não tem sessão pra conferir.
 */

/** O `message` da recusa — a loja escreve a frase (`recusaDaPorta`, em `apps/loja/src/lib/pagamento.ts`). */
export const RESPOSTA_DO_VALOR = "valor_divergente"

/** As situações de sessão que o fechamento autoriza, como no `validateCartPaymentsStep` do Medusa. */
const QUE_O_FECHAMENTO_AUTORIZA = [
  "pending",
  "requires_more",
  "authorized",
  "captured",
  "pending_authorization",
]

type SessaoCrua = {
  id?: string | null
  status?: string | null
  amount?: unknown
  raw_amount?: unknown
  currency_code?: string | null
}

export type CarrinhoDoFechamento = {
  total?: unknown
  raw_total?: unknown
  currency_code?: string | null
  payment_collection?: { payment_sessions?: (SessaoCrua | null)[] | null } | null
}

export type ValorDoPagamento =
  | { tipo: "bate" }
  | { tipo: "fora"; sessao: string; cobraria: number; total: number; moeda: string | null }
  /** Um dos valores veio num formato que não se lê: a porta não trava venda por isso (ver o hook). */
  | { tipo: "ilegivel"; sessao: string }

/** Cada sessão que o fechamento pode autorizar cobra exatamente o total do carrinho, na moeda dele? */
export function valorDoPagamento(carrinho: CarrinhoDoFechamento): ValorDoPagamento {
  const total = emCentavos(carrinho.raw_total ?? carrinho.total)
  const moeda = carrinho.currency_code?.toLowerCase() ?? null
  for (const s of carrinho.payment_collection?.payment_sessions ?? []) {
    if (!s?.id || !QUE_O_FECHAMENTO_AUTORIZA.includes(String(s.status))) continue
    const cobraria = emCentavos(s.raw_amount ?? s.amount)
    if (!Number.isFinite(total) || !Number.isFinite(cobraria))
      return { tipo: "ilegivel", sessao: s.id }
    const daSessao = s.currency_code?.toLowerCase() ?? null
    const outraMoeda = Boolean(moeda && daSessao && moeda !== daSessao)
    if (cobraria !== total || outraMoeda) {
      return { tipo: "fora", sessao: s.id, cobraria, total, moeda: daSessao }
    }
  }
  return { tipo: "bate" }
}
