import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes, type Integracoes } from "../configuracoes"
import { gravarNoMetadataDoPedido, lerNoCaminho } from "../metadata-do-pedido"
import { sinal } from "../observabilidade/sinal"
import { chavesDosAnuncios } from "./chaves"
import {
  compraPraMeta,
  compraPraTiktok,
  compraProGa4,
  decidir,
  NOME_DA_PLATAFORMA,
  PLATAFORMAS,
  type PedidoDaCompra,
  type Plataforma,
  type RegistroDaCompra,
} from "./compra"
import { CHAVE_DO_RASTRO, lerRastro, type Rastro } from "./rastro"

/**
 * A COMPRA PELO SERVIDOR — quando o pagamento entra, a Meta, o GA4 e o
 * TikTok ficam sabendo (as regras e o formato de cada um: `compra.ts`).
 *
 * Quem chama: o `pagamento-capturado` (na hora), a rota do rastro (a loja
 * mandou o rastro de um pedido já pago) e a varredura de 5 em 5 minutos do
 * `confirmar-pedidos` (o que ficou pra trás: a plataforma fora do ar, o
 * rastro que chegou depois do pagamento).
 *
 * UMA VEZ POR PLATAFORMA: o que foi feito fica em `fb_anuncios.compra.<plataforma>`
 * (enviada, dispensada ou recusada), lido dentro da trava do pedido. Queda
 * (a rede, o 5xx, o limite de chamadas) não grava nada: a próxima rodada
 * tenta de novo, até 24 horas depois do pagamento.
 *
 * A CHAVE NUNCA VAI PRO LOG: o endereço da Meta leva o token na query, e
 * nenhuma linha daqui escreve endereço.
 */

const VERSAO_DA_META = "v26.0"
const CAMINHO_DO_REGISTRO = ["fb_anuncios", "compra"] as const
const JANELA_MS = 24 * 60 * 60 * 1000
const POR_RODADA = 20

const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  "created_at",
  "metadata",
  "total",
  "credit_line_total",
  "shipping_total",
  "items.variant_id",
  "items.title",
  "items.product_title",
  "items.quantity",
  "items.unit_price",
  "items.adjustments.code",
  "shipping_address.phone",
  "payment_collections.payments.captured_at",
]

type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  created_at?: unknown
  metadata?: Record<string, unknown> | null
  total?: unknown
  credit_line_total?: unknown
  shipping_total?: unknown
  items?: ({
    variant_id?: string | null
    title?: string | null
    product_title?: string | null
    quantity?: unknown
    unit_price?: unknown
    adjustments?: ({ code?: string | null } | null)[] | null
  } | null)[]
  shipping_address?: { phone?: string | null } | null
  payment_collections?: ({ payments?: ({ captured_at?: unknown } | null)[] | null } | null)[]
}

const data = (v: unknown): Date | null => {
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** O pedido no formato da compra, ou nulo se ainda não foi pago. */
export function pedidoDaCompra(o: PedidoLido): PedidoDaCompra | null {
  const pagos = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .map((p) => data(p?.captured_at))
    .filter((d): d is Date => Boolean(d))
  if (!pagos.length) return null
  const itens = (o.items ?? []).filter((i): i is NonNullable<typeof i> => Boolean(i))
  const cupom =
    itens
      .flatMap((i) => i.adjustments ?? [])
      .map((a) => a?.code ?? "")
      .find((c) => c && !c.startsWith("BUMP-")) ?? null
  return {
    id: o.id,
    numero: Number(o.display_id ?? 0),
    email: o.email ?? null,
    telefone: o.shipping_address?.phone ?? null,
    total: Number(o.total ?? 0) + Number(o.credit_line_total ?? 0),
    frete: Number(o.shipping_total ?? 0),
    cupom,
    itens: itens.map((i) => ({
      id: i.variant_id ?? "",
      nome: i.product_title ?? i.title ?? "Produto",
      quantidade: Number(i.quantity ?? 1),
      preco: Number(i.unit_price ?? 0),
    })),
    pagoEm: new Date(Math.max(...pagos.map((d) => d.getTime()))),
  }
}

type Resposta = { status: number; json: Record<string, unknown> | null; texto: string }

async function postar(
  url: string,
  corpo: unknown,
  cabecalhos: Record<string, string> = {}
): Promise<Resposta> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  })
  const texto = await r.text()
  let json: Record<string, unknown> | null = null
  try {
    const lido = JSON.parse(texto) as unknown
    json = lido && typeof lido === "object" ? (lido as Record<string, unknown>) : null
  } catch {
    // resposta sem JSON (o GA4 responde vazio)
  }
  return { status: r.status, json, texto: texto.slice(0, 300) }
}

/** O que a resposta quer dizer: foi, não vai (e por quê), ou tentar de novo depois. */
type Desfecho =
  { como: "enviada" } | { como: "recusada"; motivo: string } | { como: "tentar"; motivo: string }

function desfechoDaMeta(r: Resposta): Desfecho {
  if (r.status >= 200 && r.status < 300) return { como: "enviada" }
  const erro = (r.json?.error ?? {}) as { code?: number; message?: string }
  const motivo = `${r.status} ${erro.code ?? ""} ${erro.message ?? r.texto}`.trim().slice(0, 200)
  // 1 e 2: falha deles; 4, 17 e 341: limite de chamadas.
  if (r.status >= 500 || [1, 2, 4, 17, 341].includes(Number(erro.code)))
    return { como: "tentar", motivo }
  return { como: "recusada", motivo }
}

function desfechoDoGa4(r: Resposta): Desfecho {
  if (r.status >= 200 && r.status < 300) return { como: "enviada" }
  const motivo = `${r.status} ${r.texto}`.trim().slice(0, 200)
  return r.status >= 500 || r.status === 429
    ? { como: "tentar", motivo }
    : { como: "recusada", motivo }
}

function desfechoDoTiktok(r: Resposta): Desfecho {
  const codigo = Number(r.json?.code ?? -1)
  if (r.status === 200 && codigo === 0) return { como: "enviada" }
  const motivo = `${r.status} ${codigo} ${String(r.json?.message ?? r.texto)}`.trim().slice(0, 200)
  // 40100: limite de chamadas.
  if (r.status >= 500 || codigo === 40100) return { como: "tentar", motivo }
  return { como: "recusada", motivo }
}

async function mandarPra(
  plataforma: Plataforma,
  p: PedidoDaCompra,
  r: Rastro,
  i: Integracoes,
  agora: Date
): Promise<Desfecho> {
  try {
    if (plataforma === "meta") {
      const base = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/+$/, "")
      const token = encodeURIComponent(process.env.META_CAPI_TOKEN ?? "")
      return desfechoDaMeta(
        await postar(
          `${base}/${VERSAO_DA_META}/${i.metaPixel}/events?access_token=${token}`,
          compraPraMeta(p, r, agora, process.env.META_TEST_EVENT_CODE)
        )
      )
    }
    if (plataforma === "ga4") {
      const base = (process.env.GA4_MP_URL || "https://www.google-analytics.com").replace(
        /\/+$/,
        ""
      )
      const corpo = compraProGa4(p, r, agora)
      if (!corpo) return { como: "recusada", motivo: "sem-client-id" }
      const segredo = encodeURIComponent(process.env.GA4_API_SECRET ?? "")
      return desfechoDoGa4(
        await postar(`${base}/mp/collect?measurement_id=${i.ga4}&api_secret=${segredo}`, corpo)
      )
    }
    const base = (process.env.TIKTOK_EVENTS_URL || "https://business-api.tiktok.com").replace(
      /\/+$/,
      ""
    )
    return desfechoDoTiktok(
      await postar(
        `${base}/open_api/v1.3/event/track/`,
        compraPraTiktok(p, r, i.tiktok ?? "", agora, process.env.TIKTOK_TEST_EVENT_CODE),
        { "Access-Token": process.env.TIKTOK_EVENTS_TOKEN ?? "" }
      )
    )
  } catch (e) {
    // A rede, o tempo esgotado: tenta de novo na próxima rodada.
    return { como: "tentar", motivo: e instanceof Error ? e.name : "falhou" }
  }
}

export type ResultadoDaCompra = Partial<
  Record<Plataforma, RegistroDaCompra["como"] | "tentar" | "esperar">
>

/**
 * Manda a compra deste pedido pra cada plataforma que ainda não recebeu —
 * se ele já foi pago. Devolve o que aconteceu em cada uma (o que não aparece
 * é "nada a fazer").
 */
export async function mandarCompra(
  container: MedusaContainer,
  pedidoId: string,
  agora = new Date()
): Promise<ResultadoDaCompra> {
  return container.resolve(Modules.LOCKING).execute(
    `anuncios-compra:${pedidoId}`,
    async () => {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: pedidos } = await query.graph({
        entity: "order",
        fields: CAMPOS,
        filters: { id: pedidoId },
      })
      const o = pedidos[0] as PedidoLido | undefined
      if (!o || o.status === "canceled") return {}
      const p = pedidoDaCompra(o)
      if (!p) return {}

      const [loja] = await container
        .resolve(Modules.STORE)
        .listStores({}, { select: ["metadata"], take: 1 })
      const integracoes = lerConfiguracoes(loja?.metadata).integracoes
      const chaves = chavesDosAnuncios()
      const rastro = lerRastro(o.metadata?.[CHAVE_DO_RASTRO])
      const feito = (lerNoCaminho(o.metadata, CAMINHO_DO_REGISTRO) ?? {}) as Partial<
        Record<Plataforma, RegistroDaCompra>
      >
      const criado = data(o.created_at) ?? agora
      const codigo: Record<Plataforma, string | null> = {
        meta: integracoes.metaPixel,
        ga4: integracoes.ga4,
        tiktok: integracoes.tiktok,
      }

      const resultado: ResultadoDaCompra = {}
      const novos: Partial<Record<Plataforma, RegistroDaCompra>> = {}
      for (const plataforma of PLATAFORMAS) {
        const decisao = decidir(plataforma, {
          codigo: codigo[plataforma],
          chave: chaves[plataforma],
          rastro,
          feito: feito[plataforma],
          idadeMs: agora.getTime() - criado.getTime(),
        })
        if (decisao === "nada") continue
        if (decisao === "esperar") {
          resultado[plataforma] = "esperar"
          continue
        }
        if (typeof decisao === "object") {
          novos[plataforma] = {
            em: agora.toISOString(),
            como: "dispensada",
            motivo: decisao.dispensar,
          }
          resultado[plataforma] = "dispensada"
          continue
        }
        const desfecho = await mandarPra(plataforma, p, rastro as Rastro, integracoes, agora)
        const resumo = `${NOME_DA_PLATAFORMA[plataforma]} · a compra do pedido #${p.numero}`
        sinal({
          integracao: "anuncios",
          ok: desfecho.como === "enviada",
          resumo,
          detalhe: desfecho.como === "enviada" ? null : desfecho.motivo,
        })
        resultado[plataforma] = desfecho.como
        if (desfecho.como === "tentar") continue
        novos[plataforma] =
          desfecho.como === "enviada"
            ? { em: agora.toISOString(), como: "enviada" }
            : { em: agora.toISOString(), como: "recusada", motivo: desfecho.motivo }
      }

      if (Object.keys(novos).length)
        await gravarNoMetadataDoPedido(container, pedidoId, CAMINHO_DO_REGISTRO, (atual) => ({
          ...(atual && typeof atual === "object" ? atual : {}),
          ...novos,
        }))
      return resultado
    },
    { timeout: 60 }
  )
}

/**
 * A VARREDURA — os pedidos pagos nas últimas 24 horas que ainda devem a
 * compra a alguma plataforma ligada. Roda no `confirmar-pedidos`.
 */
export async function mandarComprasPendentes(
  container: MedusaContainer,
  agora = new Date()
): Promise<{ olhados: number; enviadas: number; falharam: number }> {
  const relatorio = { olhados: 0, enviadas: 0, falharam: 0 }
  const chaves = chavesDosAnuncios()
  const [loja] = await container
    .resolve(Modules.STORE)
    .listStores({}, { select: ["metadata"], take: 1 })
  const i = lerConfiguracoes(loja?.metadata).integracoes
  // Ligada é a que tem o código no painel E a chave no Railway.
  const ligadas = PLATAFORMAS.filter(
    (p) => chaves[p] && (p === "meta" ? i.metaPixel : p === "ga4" ? i.ga4 : i.tiktok)
  )
  if (!ligadas.length) return relatorio

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

  const { data: ligacoes } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id", "order.id", "order.status", "order.metadata"],
    filters: { payment_collection_id: colecoes },
  })
  type Ligacao = { order?: { id?: string; status?: string; metadata?: unknown } | null }
  const devendo: string[] = []
  for (const l of ligacoes as Ligacao[]) {
    const o = l.order
    if (!o?.id || o.status === "canceled" || devendo.includes(o.id)) continue
    const feito = (lerNoCaminho(o.metadata, CAMINHO_DO_REGISTRO) ?? {}) as Record<string, unknown>
    if (ligadas.some((p) => !feito[p])) devendo.push(o.id)
  }

  for (const id of devendo.slice(0, POR_RODADA)) {
    relatorio.olhados++
    try {
      const r = await mandarCompra(container, id, agora)
      relatorio.enviadas += Object.values(r).filter((c) => c === "enviada").length
      relatorio.falharam += Object.values(r).filter(
        (c) => c === "tentar" || c === "recusada"
      ).length
    } catch {
      relatorio.falharam++
    }
  }
  return relatorio
}
