import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PREFIXO_DO_BUMP } from "./bumps"
import { PREFIXO_DA_PROMOCAO } from "./cupons"
import {
  CAMPOS as CAMPOS_DA_CONFIRMACAO,
  paraPedidoDoEmail,
  type PedidoLido,
} from "./confirmar-pedido"
import { emailNoLog, enviarEmail } from "./email"
import { emailDeVendaNova, type VendaDoAviso } from "./emails/venda-nova"
import { emailsPraAvisar } from "./equipe/avisados"
import { gravarNoMetadataDoPedido, lerNoCaminho } from "./metadata-do-pedido"
import { ehParceiro } from "./pagamento/parceiros"

/**
 * O AVISO DE VENDA NOVA — um e-mail pro dono a cada pedido pago, logo que o
 * pagamento entra. O desenho está em `emails/venda-nova.ts`; aqui é quando,
 * pra quem e quantas vezes.
 *
 * O MOLDE É O DO PEDIDO CONFIRMADO (`confirmar-pedido.ts`), pelos mesmos
 * caminhos. Na hora, pelo `payment.captured` (`subscribers/pagamento-capturado.ts`,
 * logo depois da confirmação do cliente): o Pix pago, pelo aviso do parceiro
 * ou pela conciliação; o cartão aprovado no checkout (`pedido-pago-na-hora.ts`)
 * ou depois da análise de fraude — o cartão em análise só avisa quando é
 * cobrado. Embaixo, a varredura do job `confirmar-pedidos` (de 5 em 5 minutos)
 * e do `POST /admin/pedidos/confirmar`, que olha os pagamentos das últimas 24
 * horas e manda o que faltou: o "Check status" do admin, que captura sem
 * evento nenhum, e o e-mail que o Resend recusou por um instante. O aviso que
 * sai atrasado diz a hora do pagamento.
 *
 * PRA QUEM: o papel dono (`emailsPraAvisar`; a linha "Venda nova" de
 * `AVISOS_DA_EQUIPE`, na aba E-mails das Configurações do painel) — um e-mail
 * pra cada dono ativo no painel; sem ninguém no painel, pra cada usuário do
 * admin do Medusa.
 *
 * UMA VEZ POR PEDIDO, com as três travas da confirmação:
 *   1. a trava do Medusa por pedido (`venda-nova:<id>`) — o aviso do Pix e a
 *      conciliação, ou o evento e a varredura, chegando juntos: um espera;
 *   2. o registro no pedido (`metadata.emails.venda`), lido DENTRO da trava e
 *      gravado pela porta do metadata (`metadata-do-pedido.ts`). Ele só é
 *      gravado quando todo mundo recebeu: com dois donos e o Resend caindo no
 *      meio, a varredura seguinte manda de novo pros dois…
 *   3. …e a chave de idempotência do Resend (`venda-nova/<id>/<para>`) segura
 *      o repetido de quem já tinha recebido — e cobre o instante entre o
 *      Resend aceitar e o registro ser gravado.
 *
 * QUANDO NÃO SAI: pedido cancelado (o Pix pago num pedido já cancelado volta
 * pra quem pagou — não é venda); pagamento ainda não capturado (Pix
 * esperando, cartão em análise); pedido sem parceiro de pagamento (o
 * provisório, "a combinar"); e pedido que já saiu pra entrega — venda velha
 * não é notícia.
 */

/** Até onde a varredura olha pra trás, pela hora da captura — a mesma da confirmação. */
const JANELA_MS = 24 * 60 * 60 * 1000

/** Quantos pedidos cada rodada tenta. Um por venda: o evento já resolve quase todos. */
const POR_RODADA = 20

/** Onde o aviso fica registrado no pedido: ao lado do `emails.confirmado`. */
const CAMINHO = ["emails", "venda"] as const

const CAMPOS = [...CAMPOS_DA_CONFIRMACAO, "items.adjustments.code"]

type ItemLido = NonNullable<NonNullable<PedidoLido["items"]>[number]>

/** O pedido como a consulta daqui devolve: o da confirmação, com os códigos de desconto nos itens. */
export type PedidoDaVenda = Omit<PedidoLido, "items"> & {
  items?:
    ((ItemLido & { adjustments?: ({ code?: string | null } | null)[] | null }) | null)[] | null
}

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type RegistroDaVenda = {
  em: string
  /** `email`: saiu pra todo mundo. `dispensado`: não vai sair nunca, e o `motivo` diz por quê. */
  como: "email" | "dispensado"
  /** Quantas pessoas receberam. */
  para?: number
  motivo?: string
}

export function lerRegistroDaVenda(metadata: unknown): RegistroDaVenda | null {
  const r = lerNoCaminho(metadata, CAMINHO)
  if (!r || typeof r !== "object") return null
  const { em, como } = r as Record<string, unknown>
  if (typeof em !== "string" || typeof como !== "string") return null
  return r as RegistroDaVenda
}

async function registrar(container: MedusaContainer, pedidoId: string, registro: RegistroDaVenda) {
  await gravarNoMetadataDoPedido(container, pedidoId, CAMINHO, registro)
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

const data = (v: unknown): Date | null => {
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** A hora do pagamento: a captura mais recente do pedido — ou null, sem captura. */
export function pagoEm(o: Pick<PedidoLido, "payment_collections">): Date | null {
  const horas = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .map((p) => data(p?.captured_at))
    .filter((d): d is Date => Boolean(d))
  return horas.length ? new Date(Math.max(...horas.map((d) => d.getTime()))) : null
}

export type DecisaoDaVenda =
  | { mandar: true }
  | {
      mandar: false
      motivo: "ja-registrado" | "cancelado" | "nao-pago" | "sem-parceiro" | "ja-saiu"
    }

/** Motivos que não mudam mais: ficam registrados, e a varredura não volta. */
const PARA_SEMPRE = new Set(["sem-parceiro", "ja-saiu"])

export function decidirAvisoDeVenda(o: PedidoLido): DecisaoDaVenda {
  if (lerRegistroDaVenda(o.metadata)) return { mandar: false, motivo: "ja-registrado" }
  if (o.status === "canceled") return { mandar: false, motivo: "cancelado" }
  if (!pagoEm(o)) return { mandar: false, motivo: "nao-pago" }
  const sessoes = (o.payment_collections ?? []).flatMap((c) => c?.payment_sessions ?? [])
  if (!sessoes.some((s) => ehParceiro(s?.provider_id))) {
    return { mandar: false, motivo: "sem-parceiro" }
  }
  if ((o.fulfillments ?? []).some((f) => f?.shipped_at || f?.delivered_at)) {
    return { mandar: false, motivo: "ja-saiu" }
  }
  return { mandar: true }
}

/**
 * O pedido no formato do aviso: os itens, os totais e o pagamento do e-mail
 * de confirmação (`paraPedidoDoEmail`), sem nada de quem comprou — nem o
 * final do cartão —, mais a hora do pagamento e os cupons.
 */
export function paraVenda(o: PedidoDaVenda, agora = new Date()): VendaDoAviso {
  const p = paraPedidoDoEmail(o)
  const cupons = (o.items ?? [])
    .flatMap((i) => i?.adjustments ?? [])
    .map((a) => a?.code?.trim() ?? "")
    // A oferta do checkout e a promoção automática ("Leve X, pague Y") não são cupom.
    .filter((c) => c && !c.startsWith(PREFIXO_DO_BUMP) && !c.startsWith(PREFIXO_DA_PROMOCAO))
  return {
    id: p.id,
    numero: p.numero,
    itens: p.itens,
    subtotal: p.subtotal,
    desconto: p.desconto,
    frete: p.frete,
    total: p.total,
    formaDeEntrega: p.formaDeEntrega,
    pagamento:
      p.pagamento.forma === "cartao"
        ? { forma: "cartao", bandeira: p.pagamento.bandeira, parcelas: p.pagamento.parcelas }
        : { forma: "pix" },
    pagoEm: pagoEm(o) ?? agora,
    cupons: [...new Set(cupons)],
  }
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type AvisoDeVenda =
  | { resultado: "mandou"; numero: number; para: number }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; numero: number; motivo: string }

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoDaVenda | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoDaVenda | undefined) ?? null
}

/**
 * Avisa o dono da venda deste pedido, se for a hora e se ainda não avisou.
 *
 * `quieto` é pra varredura, como na confirmação: o porquê de cada falha volta
 * no resultado, e ela diz num resumo só o que não saiu.
 */
export async function avisarVenda(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date(), quieto = false }: { agora?: Date; quieto?: boolean } = {}
): Promise<AvisoDeVenda> {
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    `venda-nova:${pedidoId}`,
    async (): Promise<AvisoDeVenda> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }
      const numero = Number(pedido.display_id ?? 0)

      const decisao = decidirAvisoDeVenda(pedido)
      if (!decisao.mandar) {
        if (PARA_SEMPRE.has(decisao.motivo)) {
          await registrar(container, pedidoId, {
            em: agora.toISOString(),
            como: "dispensado",
            motivo: decisao.motivo,
          })
        }
        return { resultado: "nada", motivo: decisao.motivo }
      }

      const emails = await emailsPraAvisar(container, ["dono"])
      if (!emails.length) {
        // Sem ninguém no painel nem no admin: a varredura não tem o que tentar
        // a cada 5 minutos. O log diz qual venda ficou sem aviso.
        await registrar(container, pedidoId, {
          em: agora.toISOString(),
          como: "dispensado",
          motivo: "sem-ninguem",
        })
        logger.warn(`[venda] #${numero}: ninguém na equipe nem no admin pra avisar por e-mail`)
        return { resultado: "nada", motivo: "sem-ninguem" }
      }

      const venda = paraVenda(pedido, agora)
      // Quieto, o aviso do `enviarEmail` (o porquê do Resend) volta no motivo.
      const avisos: string[] = []
      const registroDoEmail = quieto
        ? {
            info: (m: string) => logger.info(m),
            warn: (m: string) => void avisos.push(m.replace(/^\[email\] /, "")),
            error: (m: string) => logger.error(m),
          }
        : logger
      const receberam: string[] = []
      const falhas: string[] = []
      let recusados = 0
      for (const para of emails) {
        const r = await enviarEmail(emailDeVendaNova(para, venda), registroDoEmail, {
          idempotencia: `venda-nova/${pedidoId}/${para}`.slice(0, 256),
        })
        if (r.ok) receberam.push(para)
        else if (r.status === 422) {
          // Endereço que o Resend não aceita: insistir não muda nada.
          recusados++
          logger.warn(
            `[venda] #${numero}: o Resend não aceita ${emailNoLog(para)} — não tento de novo`
          )
        } else falhas.push(r.motivo)
      }

      if (falhas.length) {
        if (!quieto) {
          logger.warn(
            `[venda] o aviso do #${numero} não saiu pra ${falhas.length} de ${emails.length} ` +
              `(${falhas[0]}) — a varredura tenta de novo`
          )
        }
        return { resultado: "falhou", numero, motivo: avisos[0] ?? falhas[0] }
      }

      await registrar(
        container,
        pedidoId,
        receberam.length
          ? { em: agora.toISOString(), como: "email", para: receberam.length }
          : { em: agora.toISOString(), como: "dispensado", motivo: "recusado" }
      )
      if (!receberam.length) return { resultado: "nada", motivo: "recusado pelo Resend" }
      logger.info(`[venda] aviso do #${numero} pra ${receberam.map(emailNoLog).join(", ")}`)
      return { resultado: "mandou", numero, para: receberam.length }
    },
    { timeout: 30 }
  )
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

export type RelatorioDasVendas = {
  /** Pedidos pagos na janela que ainda não tinham registro. */
  pendentes: number
  mandados: string[]
  falharam: string[]
  dispensados: number
}

export async function avisarVendasRecentes(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDasVendas> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDasVendas = {
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
    if (!pedido?.id || pedido.status === "canceled" || lerRegistroDaVenda(pedido.metadata)) continue
    if (!pendentes.includes(pedido.id)) pendentes.push(pedido.id)
  }
  relatorio.pendentes = pendentes.length

  for (const id of pendentes.slice(0, POR_RODADA)) {
    try {
      const r = await avisarVenda(container, id, { agora, quieto: true })
      if (r.resultado === "mandou") relatorio.mandados.push(`#${r.numero}`)
      else if (r.resultado === "falhou") relatorio.falharam.push(`#${r.numero} (${r.motivo})`)
      else relatorio.dispensados++
    } catch (e) {
      relatorio.falharam.push(`${id} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (relatorio.falharam.length) {
    logger.warn(
      `[venda] avisos de venda: ${relatorio.mandados.length} mandados, ${relatorio.falharam.length} ` +
        `não saíram — ${relatorio.falharam.slice(0, 3).join("; ")}` +
        `${relatorio.falharam.length > 3 ? "…" : ""} — a próxima rodada tenta de novo`
    )
  }
  return relatorio
}
