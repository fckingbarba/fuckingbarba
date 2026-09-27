import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  processPaymentWorkflow,
  refundPaymentsWorkflow,
} from "@medusajs/medusa/core-flows"
import { avisarDevolucao } from "../avisar-devolucao"
import type { RelatorioDeEstornos } from "../estornos"
import { emReais } from "./comum"
import { ehParceiro } from "./parceiros"

/**
 * O QUE AS CONCILIAÇÕES DIVIDEM — a do Pagar.me (`lib/conciliar-pagamentos.ts`,
 * que também é quem roda as duas) e a do Mercado Pago
 * (`lib/conciliar-mercadopago.ts`).
 *
 * Aqui só mora o que NÃO fala com parceiro nenhum: o relatório da rodada, o
 * pedido preso num pagamento que já acabou, as três escritas no Medusa
 * (registrar o pagamento, cancelar o pedido, a mensagem de um erro) e a
 * varredura do dinheiro que entrou num pedido já cancelado — que devolve
 * PELO MEDUSA (`refundPaymentsWorkflow`), e o Medusa chama o parceiro certo.
 * Saiu do `conciliar-pagamentos.ts` na 0140.
 */

/** Até quando procurar dinheiro que entrou depois de o pedido ser cancelado. */
const JANELA_CANCELADOS_MS = 7 * 24 * 60 * 60 * 1000

export type Relatorio = {
  conferidas: number
  pagas: string[]
  canceladas: string[]
  estornadas: string[]
  esperando: number
  /** O que a rodada dos estornos viu e fez — ver `lib/estornos.ts`. */
  estornos: Omit<RelatorioDeEstornos, "avisos">
  avisos: string[]
}

export const relatorioVazio = (): Relatorio => ({
  conferidas: 0,
  pagas: [],
  canceladas: [],
  estornadas: [],
  esperando: 0,
  estornos: { falharam: [], pedidosDeNovo: [], confirmados: [] },
  avisos: [],
})

/** Uma sessão de pagamento com a coleção e o pedido dela — o que as rodadas leem. */
export type Sessao = {
  id: string
  provider_id?: string
  amount: unknown
  currency_code: string
  status: string
  data: Record<string, unknown> | null
  created_at: string | Date
  payment_collection?: {
    id: string
    status?: string
    order?: { id: string; status?: string; display_id?: number } | null
  } | null
}

/* ── o pedido preso num pagamento que já acabou ────────────────────────────── */

/** Uma sessão recusada ou cancelada, com a coleção de pagamento e o pedido dela. */
export type SessaoEncerrada = Omit<Sessao, "payment_collection"> & {
  payment_collection?:
    | (NonNullable<Sessao["payment_collection"]> & {
        payment_sessions?: { id: string; status: string }[] | null
        payments?: { id: string; canceled_at?: string | Date | null }[] | null
      })
    | null
}

/** Sessões que ainda podem virar (ou já viraram) dinheiro. */
const VIVAS = new Set<string>([
  PaymentSessionStatus.PENDING,
  PaymentSessionStatus.PENDING_AUTHORIZATION,
  PaymentSessionStatus.REQUIRES_MORE,
  PaymentSessionStatus.AUTHORIZED,
  PaymentSessionStatus.CAPTURED,
])

/**
 * O PEDIDO QUE FICOU ESPERANDO UM PAGAMENTO QUE JÁ ACABOU.
 *
 * A sessão terminou recusada ou cancelada POR FORA da conciliação — o "Check
 * status" do admin num cartão que a análise reprovou grava a sessão como erro
 * na hora —, e a rodada de pendentes, que só olha sessão pendente, nunca mais
 * passava por ela: o pedido ficava "aguardando" pra sempre, com o estoque
 * reservado e sem e-mail nenhum (24/09).
 *
 * Preso é o pedido AINDA ABERTO, sem pagamento registrado de pé e sem outra
 * sessão viva na mesma coleção. O resto não é com esta rodada: pedido
 * cancelado já soltou o estoque, e pedido com pagamento pagou.
 */
export function pedidoPreso(sessao: SessaoEncerrada): boolean {
  const colecao = sessao.payment_collection
  const pedido = colecao?.order
  if (!pedido?.id || pedido.status !== "pending") return false
  if (
    sessao.status !== PaymentSessionStatus.ERROR &&
    sessao.status !== PaymentSessionStatus.CANCELED
  ) {
    return false
  }
  if ((colecao?.payment_sessions ?? []).some((s) => VIVAS.has(s?.status))) return false
  if ((colecao?.payments ?? []).some((p) => p && !p.canceled_at)) return false
  return true
}

/* ── pago depois de cancelado ─────────────────────────────────────────────── */

/**
 * O DINHEIRO QUE ENTROU NUM PEDIDO QUE NÃO EXISTE MAIS.
 *
 * É a outra ponta do QR que não morre: cancelar o pedido não cancela o Pix
 * pendente no Pagar.me (412), então a pessoa ainda pode pagar — e paga, porque o QR
 * está no WhatsApp dela desde ontem. O pagamento entra pela sessão vigiada,
 * o webhook (ou a conciliação) registra, e o dinheiro fica num pedido
 * cancelado.
 *
 * Esta varredura olha todo pedido cancelado dos últimos 7 dias e devolve,
 * pelo Medusa, o que estiver capturado e não devolvido — ver
 * `devolverDoCancelado`.
 *
 * ┌─ `refundPaymentsWorkflow`, no PLURAL ──────────────────────────────────┐
 * │ O singular (`refundPaymentWorkflow`) valida o pedido antes e recusa:   │
 * │ "Order … has been canceled" — exatamente o caso que estamos            │
 * │ resolvendo. O plural trabalha no pagamento, e não no pedido, e passa.  │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export async function devolverPagosDepoisDoCancelamento(
  container: MedusaContainer,
  agora: Date,
  relatorio: Relatorio
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: CAMPOS_DO_CANCELADO,
    filters: {
      status: "canceled",
      canceled_at: { $gte: new Date(agora.getTime() - JANELA_CANCELADOS_MS) },
    },
  })
  for (const pedido of pedidos as unknown as Cancelado[]) {
    await devolverDoCancelado(container, pedido, relatorio)
  }
}

/** O mesmo, pra um pedido só: o dinheiro registrado agora num pedido cancelado. */
export async function devolverDoPedidoCancelado(
  container: MedusaContainer,
  pedidoId: string,
  relatorio: Relatorio
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: CAMPOS_DO_CANCELADO,
    filters: { id: pedidoId, status: "canceled" },
  })
  const pedido = data[0] as unknown as Cancelado | undefined
  if (pedido) await devolverDoCancelado(container, pedido, relatorio)
}

const CAMPOS_DO_CANCELADO = [
  "id",
  "display_id",
  "canceled_at",
  "payment_collections.payments.id",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.refunds.amount",
]

type PagamentoDoCancelado = {
  id: string
  provider_id?: string
  amount: unknown
  captured_at?: string | null
  refunds?: { amount: unknown }[]
}
type Cancelado = {
  id: string
  display_id?: number
  canceled_at?: string | null
  payment_collections?: { payments?: PagamentoDoCancelado[] }[]
}

/**
 * Devolve, pelo Medusa, todo pagamento de um parceiro CAPTURADO e ainda não
 * devolvido de um pedido cancelado — capturado quando for.
 *
 * O cancelamento do Medusa estorna tudo o que vê pago
 * (`refundCapturedPaymentsWorkflow`), então o que sobra só pode ter entrado
 * DEPOIS dele (o QR pago depois) ou NO MEIO dele: o aviso registrando o Pix
 * enquanto o cancelamento rodava — ele lê os pagamentos no começo e grava o
 * `canceled_at` no fim. Até 24/09 só o capturado depois do `canceled_at`
 * voltava; o do meio ficava com a loja, e o e-mail dizia "estornado".
 *
 * Devolvido, quem pagou é avisado (`avisarQuemPagou`) — até 25/09 o dinheiro
 * voltava calado, depois de um e-mail dizendo "nada foi cobrado".
 */
async function devolverDoCancelado(
  container: MedusaContainer,
  pedido: Cancelado,
  relatorio: Relatorio
) {
  const cancelado = Date.parse(pedido.canceled_at ?? "")
  const nome = `#${pedido.display_id ?? pedido.id}`
  let devolveu = false

  for (const pagamento of (pedido.payment_collections ?? []).flatMap((c) => c?.payments ?? [])) {
    if (!ehParceiro(pagamento.provider_id)) continue
    const capturado = Date.parse(pagamento.captured_at ?? "")
    if (!Number.isFinite(capturado)) continue

    const devolvido = (pagamento.refunds ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const resta = Number(pagamento.amount) - devolvido
    if (!(resta > 0)) continue

    const quando =
      Number.isFinite(cancelado) && capturado <= cancelado
        ? "pago no meio do cancelamento"
        : "pago depois de o pedido ser cancelado"
    relatorio.conferidas++
    try {
      await refundPaymentsWorkflow(container).run({
        input: [{ payment_id: pagamento.id, amount: resta, note: quando }],
      })
      relatorio.estornadas.push(`${nome} (${quando})`)
      devolveu = true
    } catch (e) {
      relatorio.avisos.push(`${nome}: ${quando}, e o estorno ${mensagemDe(e)}`)
    }
  }

  if (devolveu) await avisarQuemPagou(container, pedido.id, nome, relatorio)
}

/**
 * E QUEM PAGOU FICA SABENDO — o e-mail do pagamento devolvido.
 *
 * A conciliação não escreve e-mail: quem decide se ele sai (só pra quem
 * ouviu "nada foi cobrado" e pagou depois) e o que ele diz é o
 * `lib/avisar-devolucao.ts`. Daqui sai só a hora certa, que é logo depois do
 * estorno. Se o e-mail não sair agora, não desfaz nada: a varredura dos
 * e-mails (`confirmar-pedidos`) tenta de novo.
 */
async function avisarQuemPagou(
  container: MedusaContainer,
  pedidoId: string,
  nome: string,
  relatorio: Relatorio
) {
  try {
    const r = await avisarDevolucao(container, pedidoId)
    if (r.resultado === "falhou") {
      relatorio.avisos.push(`${nome}: o e-mail da devolução não saiu agora (${r.motivo})`)
    }
  } catch (e) {
    relatorio.avisos.push(`${nome}: o e-mail da devolução não saiu agora (${mensagemDe(e)})`)
  }
}

/* ── as escritas ──────────────────────────────────────────────────────────── */

/**
 * O pagamento pelo MESMO caminho do webhook — é ele que cria o registro do
 * pagamento, a transação do pedido e o evento `payment.captured` que o worker
 * vai usar pra nota fiscal e conversão. Registrar "na mão" pularia os três.
 */
export async function registrarPagamento(
  container: MedusaContainer,
  sessaoId: string,
  centavos: number
) {
  await processPaymentWorkflow(container).run({
    input: {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessaoId, amount: emReais(centavos) },
    },
  })
}

/**
 * A MENSAGEM DE UM ERRO QUALQUER.
 *
 * Os workflows do Medusa não jogam `Error`: jogam um objeto com `message`
 * (e `type`, e `code`). Com `e instanceof Error ? … : String(e)`, esse
 * objeto virava "[object Object]" no log — e, pior, o `cancelarPedido`
 * abaixo deixava de reconhecer o "has been canceled" e subia um erro por
 * um pedido que já estava cancelado.
 */
export function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message)
  }
  return String(e)
}

/**
 * Cancela o pedido e devolve o estoque. Pedido JÁ cancelado não é erro (o
 * admin pode ter chegado antes); qualquer outra recusa é, e sobe — "tem
 * envio criado" num pedido que ninguém pagou é coisa pra gente ver.
 */
export async function cancelarPedido(container: MedusaContainer, pedidoId: string | undefined) {
  if (!pedidoId) return
  try {
    await cancelOrderWorkflow(container).run({ input: { order_id: pedidoId } })
  } catch (e) {
    if (!/has been canceled/i.test(mensagemDe(e))) throw e
  }
}
