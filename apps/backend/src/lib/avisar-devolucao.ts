import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerEstado } from "../modules/pagarme/situacao"
import { whatsappDaLoja } from "./atendimento"
import {
  itensDoEmail,
  lerRegistro,
  totalDoPedido,
  travaDosAvisos,
  type PedidoLido,
} from "./avisar-cancelamento"
import { emailNoLog, enviarEmail } from "./email"
import { emReais } from "./emails/moldura"
import { emailDePagamentoDevolvido, type DevolucaoDoEmail } from "./emails/pedido-cancelado"
import { gravarNoMetadataDoPedido } from "./metadata-do-pedido"

/**
 * O PAGAMENTO QUE CHEGOU DEPOIS DO CANCELAMENTO — o e-mail que conta que ele
 * voltou. Uma vez por pedido, e só pra quem precisa dele.
 *
 * O desenho está em `emails/pedido-cancelado.ts` (`emailDePagamentoDevolvido`);
 * aqui é quando, pra quem e quantas vezes. As travas são as do aviso de
 * cancelamento, na mesma ordem: a trava do pedido (a MESMA do aviso, pra que
 * este leia o que aquele já gravou — `travaDosAvisos`), o registro em
 * `metadata.emails.devolvido` lido dentro dela, e a chave de idempotência do
 * Resend por cima.
 *
 * ┌─ QUEM PRECISA DELE ────────────────────────────────────────────────────┐
 * │ Só quem recebeu o e-mail de cancelamento sem dinheiro nenhum ("Nada    │
 * │ foi cobrado de você") e pagou depois: o QR do Pix continua pagável     │
 * │ depois do cancelamento, e a conciliação devolve o que entrar.          │
 * │                                                                        │
 * │ Quem recebeu o "cancelado e estornado" já sabe do dinheiro — mandar    │
 * │ este seria contar duas vezes a mesma devolução. E quem ainda não       │
 * │ recebeu aviso nenhum vai receber o de cancelamento, que lê a captura e │
 * │ já sai dizendo "estornado".                                            │
 * │                                                                        │
 * │ Então a régua é o que o e-mail de cancelamento DISSE (o `porque` do    │
 * │ `emails.cancelado`), e não a hora de nada: se ele disse que não houve  │
 * │ cobrança e agora há pagamento capturado, o pagamento veio depois dele. │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SÓ COM A DEVOLUÇÃO PEDIDA: o e-mail diz "devolvemos", então espera o
 * estorno do Medusa cobrir tudo o que foi capturado. O estorno que falha no
 * `refundPaymentsWorkflow` não vira registro nenhum, e a conciliação tenta de
 * novo a cada 5 minutos — o e-mail sai com o estorno que passar. O que o
 * Pagar.me aceitar e não fizer (o Pix sem saldo) é da conferência dos
 * estornos (`lib/estornos.ts`), com a faixa no admin; o e-mail já diz
 * "responda com o número" pra esse caso.
 *
 * QUEM CHAMA: a conciliação, logo depois de devolver (`devolverDoCancelado`,
 * em `conciliar-pagamentos.ts`), e a varredura dos e-mails
 * (`avisarDevolucoesRecentes`, no job `confirmar-pedidos`) como rede.
 */

const PROVEDOR_PAGARME = "pp_pagarme_pagarme"

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

type PagamentoLido = {
  provider_id?: string | null
  amount?: unknown
  captured_at?: unknown
  refunds?: ({ amount?: unknown } | null)[] | null
}

export type PedidoDevolvido = Omit<PedidoLido, "payment_collections"> & {
  payment_collections?:
    | ({
        payments?: (PagamentoLido | null)[] | null
        payment_sessions?:
          ({ provider_id?: string | null; data?: Record<string, unknown> | null } | null)[] | null
      } | null)[]
    | null
}

const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  "metadata",
  "total",
  "credit_line_total",
  "items.*",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.refunds.amount",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.data",
]

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type RegistroDaDevolucao = {
  em: string
  /** `email`: saiu. `recusado`: o Resend não aceita o endereço. */
  como: "email" | "recusado"
  /** O valor que o e-mail disse que voltou, em reais. */
  valor?: number
  id?: string
  motivo?: string
}

export function lerRegistroDaDevolucao(metadata: unknown): RegistroDaDevolucao | null {
  const emails = (metadata as { emails?: unknown } | null | undefined)?.emails
  const r = (emails as { devolvido?: unknown } | null | undefined)?.devolvido
  if (!r || typeof r !== "object") return null
  const { em, como } = r as Record<string, unknown>
  if (typeof em !== "string" || typeof como !== "string") return null
  return r as RegistroDaDevolucao
}

async function registrar(container: MedusaContainer, pedidoId: string, r: RegistroDaDevolucao) {
  await gravarNoMetadataDoPedido(container, pedidoId, ["emails", "devolvido"], r)
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

export type DecisaoDaDevolucao =
  | { mandar: true; devolvido: { valor: number; forma: "pix" | "cartao" } }
  | {
      mandar: false
      motivo:
        | "ja-registrado"
        | "nao-cancelado"
        | "sem-email"
        | "cancelamento-sem-aviso"
        | "aviso-ja-falou-do-dinheiro"
        | "nada-pago"
        | "devolucao-andando"
    }

/** Em centavos, pra somar sem a vírgula flutuante no caminho. */
const centavos = (v: unknown) => Math.round(Number(v ?? 0) * 100)

/** O que entrou pelo Pagar.me, e quanto disso o Medusa já devolveu — em centavos. */
export function contasDoPedido(o: PedidoDevolvido) {
  const pagos = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .filter(
      (p): p is PagamentoLido => p?.provider_id === PROVEDOR_PAGARME && Boolean(p.captured_at)
    )
  return {
    capturado: pagos.reduce((s, p) => s + centavos(p.amount), 0),
    devolvido: pagos.reduce(
      (s, p) => s + (p.refunds ?? []).reduce((t, r) => t + centavos(r?.amount), 0),
      0
    ),
  }
}

export function decidirDevolucao(o: PedidoDevolvido): DecisaoDaDevolucao {
  if (lerRegistroDaDevolucao(o.metadata)) return { mandar: false, motivo: "ja-registrado" }
  if (o.status !== "canceled") return { mandar: false, motivo: "nao-cancelado" }
  if (!o.email?.includes("@")) return { mandar: false, motivo: "sem-email" }

  const aviso = lerRegistro(o.metadata)
  if (aviso?.como !== "email") return { mandar: false, motivo: "cancelamento-sem-aviso" }
  if (aviso.porque === "estornado") return { mandar: false, motivo: "aviso-ja-falou-do-dinheiro" }

  const { capturado, devolvido } = contasDoPedido(o)
  if (capturado <= 0) return { mandar: false, motivo: "nada-pago" }
  if (devolvido < capturado) return { mandar: false, motivo: "devolucao-andando" }

  const sessao = (o.payment_collections ?? [])
    .flatMap((c) => c?.payment_sessions ?? [])
    .find((s) => s?.provider_id === PROVEDOR_PAGARME)
  const forma = lerEstado(sessao?.data)?.forma === "cartao" ? "cartao" : "pix"
  return { mandar: true, devolvido: { valor: capturado / 100, forma } }
}

/* ── o pedido no formato do e-mail ────────────────────────────────────────── */

export function paraDevolucaoDoEmail(
  o: PedidoDevolvido,
  devolvido: DevolucaoDoEmail["devolvido"]
): DevolucaoDoEmail {
  return {
    id: o.id,
    numero: Number(o.display_id ?? 0),
    email: o.email ?? "",
    itens: itensDoEmail(o),
    total: totalDoPedido(o),
    devolvido,
  }
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type AvisoDaDevolucao =
  | { resultado: "mandou"; numero: number; valor: number }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; numero: number; motivo: string }

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoDevolvido | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoDevolvido | undefined) ?? null
}

/** Manda o aviso do pagamento devolvido, se for o caso e se ainda não foi. */
export async function avisarDevolucao(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date() }: { agora?: Date } = {}
): Promise<AvisoDaDevolucao> {
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    travaDosAvisos(pedidoId),
    async (): Promise<AvisoDaDevolucao> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }

      const decisao = decidirDevolucao(pedido)
      if (!decisao.mandar) return { resultado: "nada", motivo: decisao.motivo }

      const devolucao = paraDevolucaoDoEmail(pedido, decisao.devolvido)
      const { numero } = devolucao
      const valor = decisao.devolvido.valor
      const email = emailDePagamentoDevolvido({
        devolucao,
        whatsapp: await whatsappDaLoja(container),
      })
      const r = await enviarEmail(email, logger, {
        idempotencia: `pagamento-devolvido/${pedido.id}`,
      })

      if (!r.ok) {
        if (r.status === 422) {
          // Endereço que o Resend não aceita: insistir não muda isso.
          await registrar(container, pedido.id, {
            em: agora.toISOString(),
            como: "recusado",
            valor,
            motivo: r.motivo,
          })
          logger.warn(
            `[pedido] o aviso da devolução do #${numero} foi recusado pelo Resend ` +
              `(${emailNoLog(devolucao.email)}) — não tento de novo`
          )
          return { resultado: "nada", motivo: "recusado pelo Resend" }
        }
        return { resultado: "falhou", numero, motivo: r.motivo }
      }

      await registrar(container, pedido.id, {
        em: agora.toISOString(),
        como: "email",
        valor,
        ...(r.id ? { id: r.id } : {}),
      })
      logger.info(
        `[pedido] o pagamento de ${emReais(valor)} que entrou no #${numero} depois do ` +
          `cancelamento foi devolvido — avisado pra ${emailNoLog(devolucao.email)}`
      )
      return { resultado: "mandou", numero, valor }
    },
    { timeout: 30 }
  )
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

/**
 * Até onde a varredura olha pra trás, pela hora do cancelamento: a mesma
 * janela em que a conciliação devolve o que entra em pedido cancelado.
 */
const JANELA_MS = 7 * 24 * 60 * 60 * 1000

/** Quantos pedidos cada rodada tenta — o teto de trabalho jogado fora com o Resend fora. */
const POR_RODADA = 20

export type RelatorioDeDevolucoes = {
  /** Cancelados na janela com dinheiro depois do aviso, e ainda sem este e-mail. */
  pendentes: number
  mandados: string[]
  falharam: string[]
  /** Os que ainda não eram a vez: o estorno andando, por exemplo. */
  esperando: number
}

type Candidato = {
  id?: string
  metadata?: unknown
  payment_collections?:
    | ({
        payments?: ({ provider_id?: string | null; captured_at?: unknown } | null)[] | null
      } | null)[]
    | null
}

/**
 * Quem vale a pena ler inteiro: avisado sem dinheiro, com pagamento capturado
 * depois, e sem este e-mail ainda. O resto — o Pix vencido de todo dia — fica
 * na lista curta e não custa nada.
 */
function candidato(o: Candidato): boolean {
  if (!o.id || lerRegistroDaDevolucao(o.metadata)) return false
  const aviso = lerRegistro(o.metadata)
  if (aviso?.como !== "email" || aviso.porque === "estornado") return false
  return (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .some((p) => p?.provider_id === PROVEDOR_PAGARME && Boolean(p.captured_at))
}

/**
 * A rede embaixo da conciliação: todo pedido cancelado nos últimos 7 dias em
 * que entrou dinheiro depois do aviso, e que ainda não teve este e-mail. Pega
 * o Resend fora na hora da devolução, e a devolução que passou numa rodada em
 * que o e-mail não foi tentado.
 */
export async function avisarDevolucoesRecentes(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDeDevolucoes> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDeDevolucoes = {
    pendentes: 0,
    mandados: [],
    falharam: [],
    esperando: 0,
  }

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "metadata",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
    ],
    filters: {
      status: "canceled",
      canceled_at: { $gte: new Date(agora.getTime() - JANELA_MS).toISOString() },
    },
  })
  const pendentes = (data as Candidato[]).filter(candidato).map((o) => o.id as string)
  relatorio.pendentes = pendentes.length

  for (const id of pendentes.slice(0, POR_RODADA)) {
    try {
      const r = await avisarDevolucao(container, id, { agora })
      if (r.resultado === "mandou") relatorio.mandados.push(`#${r.numero}`)
      else if (r.resultado === "falhou") relatorio.falharam.push(`#${r.numero} (${r.motivo})`)
      else relatorio.esperando++
    } catch (e) {
      relatorio.falharam.push(`${id} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (relatorio.falharam.length) {
    logger.warn(
      `[pedido] avisos de pagamento devolvido: ${relatorio.mandados.length} mandados, ` +
        `${relatorio.falharam.length} não saíram — ${relatorio.falharam.slice(0, 3).join("; ")}` +
        `${relatorio.falharam.length > 3 ? "…" : ""} — a próxima rodada tenta de novo`
    )
  }
  return relatorio
}
