import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerEstado } from "../modules/pagarme/situacao"
import { whatsappDaLoja } from "./atendimento"
import { emailNoLog, enviarEmail } from "./email"
import { emailDePedidoConfirmado, type PedidoDoEmail } from "./emails/pedido-confirmado"
import { gravarNoMetadataDoPedido } from "./metadata-do-pedido"

/**
 * O E-MAIL DE PEDIDO CONFIRMADO — uma vez por pedido, quando o pagamento cai.
 *
 * O desenho está em `emails/pedido-confirmado.ts`; aqui é quando, pra quem
 * e quantas vezes.
 *
 * ┌─ POR ONDE UM PEDIDO FICA PAGO, E POR ONDE O E-MAIL SAI ────────────────┐
 * │ • Pix pago, pelo aviso do Pagar.me ou pela conciliação: o Medusa        │
 * │   captura e solta `payment.captured`, e o                              │
 * │   `subscribers/pagamento-capturado.ts` chama `confirmarPedido` na hora; │
 * │ • cartão aprovado no checkout: o pagamento nasce capturado, sem evento, │
 * │   e o `pedido-pago-na-hora.ts` solta o `payment.captured` no            │
 * │   `order.placed` — daí, o mesmo caminho;                               │
 * │ • "Check status" no admin: registra o pagamento sem evento nenhum.      │
 * │   Quem pega esse é a varredura.                                         │
 * │                                                                         │
 * │ A VARREDURA (`confirmarPedidosPagos`: o job `confirmar-pedidos`, de 5   │
 * │ em 5 minutos, e `POST /admin/pedidos/confirmar`) olha os pagamentos     │
 * │ capturados nas últimas 24 horas e manda o que faltou: o do "Check       │
 * │ status", o e-mail que falhou, o evento que se perdeu.                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * UMA VEZ SÓ, E O MESMO PEDIDO PASSA AQUI VÁRIAS VEZES: o aviso do Pix e a
 * conciliação disparam o evento pro mesmo pagamento, o cartão dispara no
 * `order.placed` e de novo no aviso `order.paid`, e a varredura passa por
 * cima de tudo. Três travas, em ordem:
 *   1. a trava do Medusa (Redis) por pedido — dois ao mesmo tempo, um espera;
 *   2. o registro no pedido (`metadata.emails.confirmado`), lido DENTRO da
 *      trava — quem chega depois encontra "já foi" e não manda. Ele é
 *      gravado pela porta do metadata (`metadata-do-pedido.ts`): gravado
 *      direto, a oferta do checkout chegando junto o apagava (o #467);
 *   3. a chave de idempotência do Resend (`pedido-confirmado/<id>`), que
 *      cobre o instante entre o Resend aceitar e o registro ser gravado.
 *
 * QUANDO NÃO SAI: pedido cancelado; pagamento ainda não capturado; pedido sem
 * o Pagar.me (o provisório, "a combinar"); e pedido que já saiu pra
 * entrega. A confirmação diz "falta enviar", e depois do e-mail "a caminho"
 * ela só confundiria — é o caso do pedido pago antes de este e-mail
 * existir, que a varredura encontra nas primeiras 24 horas.
 */

/** Até onde a varredura olha pra trás, pela hora da captura. */
const JANELA_MS = 24 * 60 * 60 * 1000

/**
 * Quantos pedidos cada rodada tenta. Com o Resend fora, é o teto de
 * trabalho jogado fora a cada 5 minutos; na operação normal nunca chega
 * perto (é um pedido por compra, e o evento já resolveu quase todos).
 */
const POR_RODADA = 20

const PROVEDOR_PAGARME = "pp_pagarme_pagarme"

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

type SessaoLida = { provider_id?: string | null; data?: Record<string, unknown> | null }

export type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  item_subtotal?: unknown
  subtotal?: unknown
  discount_total?: unknown
  shipping_total?: unknown
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
  shipping_methods?: ({ name?: string | null } | null)[] | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  payment_collections?:
    | ({
        payments?: ({ captured_at?: unknown } | null)[] | null
        payment_sessions?: (SessaoLida | null)[] | null
      } | null)[]
    | null
  fulfillments?: ({ shipped_at?: unknown; delivered_at?: unknown } | null)[] | null
}

/**
 * Os campos do pedido. Os totais saem da mesma conta que a tela de obrigado
 * vê (o `getOrderDetailWorkflow` da API da loja usa esta mesma consulta).
 */
const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  "metadata",
  "item_subtotal",
  "subtotal",
  "discount_total",
  "shipping_total",
  "total",
  "items.*",
  "shipping_methods.name",
  "shipping_address.*",
  "payment_collections.payments.captured_at",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.data",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
]

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type Registro = {
  em: string
  /**
   * `email`: saiu. `dispensado`: não vai sair nunca, e o `motivo` diz por
   * quê. `recusado`: o Resend não aceita este endereço (422), e insistir
   * não muda isso.
   */
  como: "email" | "dispensado" | "recusado"
  id?: string
  motivo?: string
}

export function lerRegistro(metadata: unknown): Registro | null {
  const emails = (metadata as { emails?: unknown } | null | undefined)?.emails
  const r = (emails as { confirmado?: unknown } | null | undefined)?.confirmado
  if (!r || typeof r !== "object") return null
  const { em, como } = r as Record<string, unknown>
  if (typeof em !== "string" || typeof como !== "string") return null
  return r as Registro
}

/**
 * Só o `emails.confirmado`, relido na hora de gravar: o `pedido` foi lido
 * antes do Resend responder, e o `emails.cancelado`, a oferta e os outros
 * registros podem ter chegado no meio.
 */
async function registrar(container: MedusaContainer, pedido: PedidoLido, registro: Registro) {
  await gravarNoMetadataDoPedido(container, pedido.id, ["emails", "confirmado"], registro)
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

export type Decisao =
  | { mandar: true }
  | {
      mandar: false
      motivo: "ja-registrado" | "cancelado" | "nao-pago" | "sem-pagarme" | "ja-saiu" | "sem-email"
    }

/** Motivos que não mudam mais: ficam registrados, e a varredura não volta. */
const PARA_SEMPRE = new Set(["sem-pagarme", "ja-saiu", "sem-email"])

const sessoesDo = (o: PedidoLido) =>
  (o.payment_collections ?? []).flatMap((c) => c?.payment_sessions ?? [])

export function decidir(o: PedidoLido): Decisao {
  if (lerRegistro(o.metadata)) return { mandar: false, motivo: "ja-registrado" }
  if (o.status === "canceled") return { mandar: false, motivo: "cancelado" }
  const capturado = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .some((p) => Boolean(p?.captured_at))
  if (!capturado) return { mandar: false, motivo: "nao-pago" }
  if (!sessoesDo(o).some((s) => s?.provider_id === PROVEDOR_PAGARME)) {
    return { mandar: false, motivo: "sem-pagarme" }
  }
  if ((o.fulfillments ?? []).some((f) => f?.shipped_at || f?.delivered_at)) {
    return { mandar: false, motivo: "ja-saiu" }
  }
  if (!o.email?.includes("@")) return { mandar: false, motivo: "sem-email" }
  return { mandar: true }
}

/* ── o pedido no formato do e-mail ────────────────────────────────────────── */

const cep = (v: string) => {
  const d = v.replace(/\D/g, "")
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v
}

/**
 * Campo por campo, o `paraPedidoVisivel` da loja (`apps/loja/src/lib/pedido.ts`):
 * o mesmo nome de item, o mesmo endereço, os mesmos totais. O pagamento sai
 * da sessão do Pagar.me, como o `lerPagamento` de lá.
 */
export function paraPedidoDoEmail(o: PedidoLido): PedidoDoEmail {
  const e = o.shipping_address
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  const sessao = sessoesDo(o).find((x) => x?.provider_id === PROVEDOR_PAGARME)
  const estado = lerEstado(sessao?.data)

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
    subtotal: Number(o.item_subtotal ?? o.subtotal ?? 0),
    desconto: Number(o.discount_total ?? 0),
    frete: Number(o.shipping_total ?? 0),
    total: Number(o.total ?? 0),
    formaDeEntrega: o.shipping_methods?.[0]?.name ?? "",
    entrega: e
      ? {
          nome: [e.first_name, e.last_name].filter(Boolean).join(" "),
          linha1: e.address_1 ?? "",
          linha2:
            [s(meta.complemento), s(meta.bairro)].filter(Boolean).join(" — ") ||
            (e.address_2 ?? ""),
          cidade: e.city ?? "",
          uf: (e.province ?? "").toUpperCase(),
          cep: cep(e.postal_code ?? ""),
        }
      : null,
    pagamento:
      estado?.forma === "cartao"
        ? {
            forma: "cartao",
            bandeira: estado.cartao?.bandeira ?? "",
            final: estado.cartao?.final ?? "",
            parcelas: estado.parcelas || 1,
          }
        : { forma: "pix" },
  }
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type Confirmacao =
  | { resultado: "mandou"; numero: number }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; numero: number; motivo: string }

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoLido | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoLido | undefined) ?? null
}

/**
 * Manda a confirmação do pedido, se for a hora e se ainda não foi.
 *
 * `quieto` é pra varredura: ela tenta vinte de uma vez e diz num resumo o
 * que não saiu (com o motivo do primeiro), em vez de uma linha de aviso por
 * pedido a cada 5 minutos.
 */
export async function confirmarPedido(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date(), quieto = false }: { agora?: Date; quieto?: boolean } = {}
): Promise<Confirmacao> {
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    `pedido-confirmado:${pedidoId}`,
    async (): Promise<Confirmacao> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }

      const decisao = decidir(pedido)
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

      const doEmail = paraPedidoDoEmail(pedido)
      const numero = doEmail.numero
      const email = emailDePedidoConfirmado({
        pedido: doEmail,
        whatsapp: await whatsappDaLoja(container),
      })
      // Quieto, o aviso do `enviarEmail` (o porquê do Resend) volta no motivo.
      const avisos: string[] = []
      const registroDoEmail = quieto
        ? {
            info: (m: string) => logger.info(m),
            warn: (m: string) => void avisos.push(m.replace(/^\[email\] /, "")),
            error: (m: string) => logger.error(m),
          }
        : logger
      const r = await enviarEmail(email, registroDoEmail, {
        idempotencia: `pedido-confirmado/${pedido.id}`,
      })

      if (!r.ok) {
        if (r.status === 422) {
          // Endereço que o Resend não aceita: insistir a cada 5 minutos por um
          // dia não muda nada. Fica registrado, e o log diz qual pedido.
          await registrar(container, pedido, {
            em: agora.toISOString(),
            como: "recusado",
            motivo: r.motivo,
          })
          logger.warn(
            `[pedido] a confirmação do #${numero} foi recusada pelo Resend (${emailNoLog(doEmail.email)}) — não tento de novo`
          )
          return { resultado: "nada", motivo: "recusado pelo Resend" }
        }
        if (!quieto) {
          logger.warn(
            `[pedido] a confirmação do #${numero} não saiu (${r.motivo}) — a varredura tenta de novo`
          )
        }
        return { resultado: "falhou", numero, motivo: avisos[0] ?? r.motivo }
      }

      await registrar(container, pedido, {
        em: agora.toISOString(),
        como: "email",
        ...(r.id ? { id: r.id } : {}),
      })
      logger.info(`[pedido] confirmação do #${numero} pra ${emailNoLog(doEmail.email)}`)
      return { resultado: "mandou", numero }
    },
    { timeout: 30 }
  )
}

/** O pedido de um pagamento — o mesmo caminho que o Medusa faz na captura. */
export async function pedidoDoPagamento(
  container: MedusaContainer,
  pagamentoId: string
): Promise<string | null> {
  const [pagamento] = await container
    .resolve(Modules.PAYMENT)
    .listPayments({ id: pagamentoId }, { select: ["id", "payment_collection_id"], take: 1 })
  if (!pagamento?.payment_collection_id) return null
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_payment_collection",
    fields: ["order.id"],
    filters: { payment_collection_id: pagamento.payment_collection_id },
  })
  return (data[0] as { order?: { id?: string } } | undefined)?.order?.id ?? null
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

export type RelatorioDeConfirmacoes = {
  /** Pedidos pagos na janela que ainda não tinham registro. */
  pendentes: number
  mandados: string[]
  falharam: string[]
  dispensados: number
}

export async function confirmarPedidosPagos(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDeConfirmacoes> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDeConfirmacoes = {
    pendentes: 0,
    mandados: [],
    falharam: [],
    dispensados: 0,
  }

  const pagos = await container.resolve(Modules.PAYMENT).listPayments(
    { captured_at: { $gte: new Date(agora.getTime() - JANELA_MS).toISOString() } },
    {
      select: ["id", "payment_collection_id", "captured_at"],
      order: { captured_at: "ASC" },
      take: 1000,
    }
  )
  const colecoes = [...new Set(pagos.map((p) => p.payment_collection_id).filter(Boolean))]
  if (!colecoes.length) return relatorio

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id", "order.id", "order.status", "order.metadata"],
    filters: { payment_collection_id: colecoes },
  })
  type Ligacao = {
    payment_collection_id?: string
    order?: { id?: string; status?: string; metadata?: unknown } | null
  }
  const porColecao = new Map((data as Ligacao[]).map((l) => [l.payment_collection_id, l.order]))

  // Na ordem da captura, o mais antigo primeiro: é o que sai da janela antes.
  const pendentes: string[] = []
  for (const colecao of colecoes) {
    const pedido = porColecao.get(colecao)
    if (!pedido?.id || pedido.status === "canceled" || lerRegistro(pedido.metadata)) continue
    if (!pendentes.includes(pedido.id)) pendentes.push(pedido.id)
  }
  relatorio.pendentes = pendentes.length

  for (const id of pendentes.slice(0, POR_RODADA)) {
    try {
      const r = await confirmarPedido(container, id, { agora, quieto: true })
      if (r.resultado === "mandou") relatorio.mandados.push(`#${r.numero}`)
      else if (r.resultado === "falhou") relatorio.falharam.push(`#${r.numero} (${r.motivo})`)
      else relatorio.dispensados++
    } catch (e) {
      relatorio.falharam.push(`${id} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (relatorio.falharam.length) {
    logger.warn(
      `[pedido] confirmações: ${relatorio.mandados.length} mandadas, ${relatorio.falharam.length} ` +
        `não saíram — ${relatorio.falharam.slice(0, 3).join("; ")}` +
        `${relatorio.falharam.length > 3 ? "…" : ""} — a próxima rodada tenta de novo`
    )
  }
  return relatorio
}
