import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerEstado } from "../modules/pagarme/situacao"
import { whatsappDaLoja } from "./atendimento"
import { emailNoLog, enviarEmail } from "./email"
import {
  emailDePedidoCancelado,
  type CancelamentoDoEmail,
  type MotivoDoCancelamento,
} from "./emails/pedido-cancelado"

/**
 * O AVISO DE PEDIDO CANCELADO — uma vez por pedido, quando ele é cancelado.
 *
 * O desenho está em `emails/pedido-cancelado.ts`; aqui é quando, pra quem e
 * quantas vezes. É o irmão do `confirmar-pedido.ts`, e as travas são as
 * mesmas, na mesma ordem: a trava do Medusa por pedido, o registro em
 * `metadata.emails.cancelado` lido DENTRO dela, e a chave de idempotência do
 * Resend por cima.
 *
 * ┌─ POR QUE O DINHEIRO É LIDO PELA CAPTURA, E NÃO PELO ESTORNO ───────────┐
 * │ O estorno do Medusa pode ser registrado no mesmo segundo do            │
 * │ cancelamento, um instante depois, ou (o admin cancelando e estornando  │
 * │ em dois cliques) minutos depois. Ler o estorno seria apostar numa      │
 * │ corrida — e o lado errado dessa aposta é um e-mail dizendo "nada foi   │
 * │ cobrado" pra quem acabou de ver R$ 62,58 saírem da conta.              │
 * │                                                                        │
 * │ A CAPTURA não corre: se houve pagamento capturado, houve dinheiro, e   │
 * │ cancelar um pedido pago sempre devolve. É essa a pergunta que o e-mail │
 * │ precisa responder.                                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * `estornouLa` é a outra ponta: a cobrança que o Pagar.me recebeu e o Medusa
 * nunca soube (o aviso ainda no caminho na hora do cancelamento). Quem
 * descobre isso é o `fecharCobrancasDoPedido`, no subscriber, que estorna na
 * mão — sem pagamento capturado nenhum pra ler aqui. O subscriber conta.
 *
 * QUANDO NÃO SAI: pedido que não está cancelado; pedido sem e-mail; e o que
 * já avisou. Pedido sem o Pagar.me (o provisório, "a combinar") avisa igual —
 * cancelaram o pedido de alguém, e essa pessoa precisa saber.
 */

const PROVEDOR_PAGARME = "pp_pagarme_pagarme"

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

type SessaoLida = { provider_id?: string | null; data?: Record<string, unknown> | null }

export type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  total?: unknown
  items?:
    | ({
        title?: string | null
        product_title?: string | null
        variant_title?: string | null
        thumbnail?: string | null
        quantity?: unknown
        unit_price?: unknown
        total?: unknown
      } | null)[]
    | null
  payment_collections?:
    | ({
        payments?: ({ amount?: unknown; captured_at?: unknown } | null)[] | null
        payment_sessions?: (SessaoLida | null)[] | null
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
  "items.*",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.data",
]

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type Registro = {
  em: string
  /** `email`: saiu. `dispensado`: não vai sair, e o `motivo` diz por quê. */
  como: "email" | "dispensado" | "recusado"
  /** O que o e-mail disse — pra saber depois qual versão a pessoa recebeu. */
  porque?: MotivoDoCancelamento
  id?: string
  motivo?: string
}

export function lerRegistro(metadata: unknown): Registro | null {
  const emails = (metadata as { emails?: unknown } | null | undefined)?.emails
  const r = (emails as { cancelado?: unknown } | null | undefined)?.cancelado
  if (!r || typeof r !== "object") return null
  const { em, como } = r as Record<string, unknown>
  if (typeof em !== "string" || typeof como !== "string") return null
  return r as Registro
}

async function registrar(container: MedusaContainer, pedido: PedidoLido, registro: Registro) {
  const meta = pedido.metadata ?? {}
  const emails = meta.emails && typeof meta.emails === "object" ? meta.emails : {}
  await container
    .resolve(Modules.ORDER)
    .updateOrders([
      { id: pedido.id, metadata: { ...meta, emails: { ...emails, cancelado: registro } } },
    ])
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

export type Decisao =
  | {
      mandar: true
      motivo: MotivoDoCancelamento
      estorno: { valor: number; forma: "pix" | "cartao" } | null
    }
  | { mandar: false; motivo: "ja-registrado" | "nao-cancelado" | "sem-email" }

/** Motivos que não mudam mais: ficam registrados, e ninguém volta neles. */
const PARA_SEMPRE = new Set(["sem-email"])

const sessoesDo = (o: PedidoLido) =>
  (o.payment_collections ?? []).flatMap((c) => c?.payment_sessions ?? [])

/** O estado do Pagar.me que ficou gravado na sessão — a forma, o valor, o Pix. */
const estadoDo = (o: PedidoLido) =>
  lerEstado(sessoesDo(o).find((s) => s?.provider_id === PROVEDOR_PAGARME)?.data)

export function decidir(o: PedidoLido, { estornouLa = false, agora = new Date() } = {}): Decisao {
  if (lerRegistro(o.metadata)) return { mandar: false, motivo: "ja-registrado" }
  if (o.status !== "canceled") return { mandar: false, motivo: "nao-cancelado" }
  if (!o.email?.includes("@")) return { mandar: false, motivo: "sem-email" }

  const estado = estadoDo(o)
  const forma = estado?.forma === "cartao" ? "cartao" : "pix"
  const capturado = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .filter((p) => Boolean(p?.captured_at))
    .reduce((soma, p) => soma + Number(p?.amount ?? 0), 0)

  if (capturado > 0) {
    return { mandar: true, motivo: "estornado", estorno: { valor: capturado, forma } }
  }
  /*
    Estornado do lado de lá, sem pagamento nenhum aqui: o valor é o da
    cobrança — o que o `estado` guardou quando o QR ou a compra nasceram, em
    centavos. Sem ele, cai no total do pedido, que é o mesmo número.
  */
  if (estornouLa) {
    const valor = estado?.valor ? estado.valor / 100 : Number(o.total ?? 0)
    return { mandar: true, motivo: "estornado", estorno: { valor, forma } }
  }

  // Ninguém pagou. O Pix que passou da validade tem uma frase própria: é a
  // razão mais comum de um pedido cancelado, e a única que a pessoa reconhece.
  const expira = Date.parse(estado?.pix?.expiraEm ?? "")
  const venceu = forma === "pix" && Number.isFinite(expira) && agora.getTime() > expira
  return { mandar: true, motivo: venceu ? "pix-vencido" : "sem-cobranca", estorno: null }
}

/* ── o pedido no formato do e-mail ────────────────────────────────────────── */

export function paraCancelamentoDoEmail(o: PedidoLido, decisao: Decisao): CancelamentoDoEmail {
  return {
    id: o.id,
    numero: Number(o.display_id ?? 0),
    email: o.email ?? "",
    itens: (o.items ?? [])
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => ({
        nome: i.product_title ?? i.title ?? "Produto",
        variante: i.variant_title && i.variant_title !== "Único" ? i.variant_title : null,
        imagem: i.thumbnail ?? null,
        quantidade: Number(i.quantity ?? 0),
        precoUnitario: Number(i.unit_price ?? 0),
        total: Number(i.total ?? 0),
      })),
    total: Number(o.total ?? 0),
    motivo: decisao.mandar ? decisao.motivo : "sem-cobranca",
    estorno: decisao.mandar ? decisao.estorno : null,
  }
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type Aviso =
  | { resultado: "mandou"; numero: number; motivo: MotivoDoCancelamento }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; numero: number; motivo: string }

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoLido | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoLido | undefined) ?? null
}

/** Manda o aviso de cancelamento, se for o caso e se ainda não foi. */
export async function avisarCancelamento(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date(), estornouLa = false }: { agora?: Date; estornouLa?: boolean } = {}
): Promise<Aviso> {
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    `pedido-cancelado:${pedidoId}`,
    async (): Promise<Aviso> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }

      const decisao = decidir(pedido, { estornouLa, agora })
      if (!decisao.mandar) {
        if (PARA_SEMPRE.has(decisao.motivo)) {
          await registrar(container, pedido, {
            em: agora.toISOString(),
            como: "dispensado",
            motivo: decisao.motivo,
          })
        }
        return { resultado: "nada", motivo: decisao.motivo }
      }

      const cancelamento = paraCancelamentoDoEmail(pedido, decisao)
      const numero = cancelamento.numero
      const email = emailDePedidoCancelado({
        cancelamento,
        whatsapp: await whatsappDaLoja(container),
      })
      const r = await enviarEmail(email, logger, {
        idempotencia: `pedido-cancelado/${pedido.id}`,
      })

      if (!r.ok) {
        if (r.status === 422) {
          // Endereço que o Resend não aceita: insistir não muda isso.
          await registrar(container, pedido, {
            em: agora.toISOString(),
            como: "recusado",
            porque: decisao.motivo,
            motivo: r.motivo,
          })
          logger.warn(
            `[pedido] o aviso de cancelamento do #${numero} foi recusado pelo Resend ` +
              `(${emailNoLog(cancelamento.email)}) — não tento de novo`
          )
          return { resultado: "nada", motivo: "recusado pelo Resend" }
        }
        return { resultado: "falhou", numero, motivo: r.motivo }
      }

      await registrar(container, pedido, {
        em: agora.toISOString(),
        como: "email",
        porque: decisao.motivo,
        ...(r.id ? { id: r.id } : {}),
      })
      logger.info(
        `[pedido] cancelamento do #${numero} (${decisao.motivo}) pra ${emailNoLog(cancelamento.email)}`
      )
      return { resultado: "mandou", numero, motivo: decisao.motivo }
    },
    { timeout: 30 }
  )
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

/** Até onde a varredura olha pra trás, pela hora do cancelamento. */
const JANELA_MS = 24 * 60 * 60 * 1000

/** Quantos pedidos cada rodada tenta — o teto de trabalho jogado fora com o Resend fora. */
const POR_RODADA = 20

export type RelatorioDeCancelamentos = {
  /** Cancelados na janela que ainda não tinham registro. */
  pendentes: number
  mandados: string[]
  falharam: string[]
  dispensados: number
}

/**
 * A rede embaixo do subscriber: todo pedido cancelado nas últimas 24 horas
 * que ainda não avisou. Pega o e-mail que o Resend recusou por um instante e
 * o evento `order.canceled` que se perdeu.
 *
 * SEM O `estornouLa` AQUI, e de propósito: quem sabe do dinheiro que entrou
 * sem o Medusa saber é o `fecharCobrancasDoPedido` do subscriber, na hora. Na
 * varredura, o que vale é o pagamento capturado — e essa leitura não corre.
 */
export async function avisarCancelamentosRecentes(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDeCancelamentos> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDeCancelamentos = {
    pendentes: 0,
    mandados: [],
    falharam: [],
    dispensados: 0,
  }

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: {
      status: "canceled",
      canceled_at: { $gte: new Date(agora.getTime() - JANELA_MS).toISOString() },
    },
  })
  const pendentes = (data as { id?: string; metadata?: unknown }[])
    .filter((o) => o.id && !lerRegistro(o.metadata))
    .map((o) => o.id as string)
  relatorio.pendentes = pendentes.length

  for (const id of pendentes.slice(0, POR_RODADA)) {
    try {
      const r = await avisarCancelamento(container, id, { agora })
      if (r.resultado === "mandou") relatorio.mandados.push(`#${r.numero}`)
      else if (r.resultado === "falhou") relatorio.falharam.push(`#${r.numero} (${r.motivo})`)
      else relatorio.dispensados++
    } catch (e) {
      relatorio.falharam.push(`${id} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (relatorio.falharam.length) {
    logger.warn(
      `[pedido] avisos de cancelamento: ${relatorio.mandados.length} mandados, ` +
        `${relatorio.falharam.length} não saíram — ${relatorio.falharam.slice(0, 3).join("; ")}` +
        `${relatorio.falharam.length > 3 ? "…" : ""} — a próxima rodada tenta de novo`
    )
  }
  return relatorio
}
