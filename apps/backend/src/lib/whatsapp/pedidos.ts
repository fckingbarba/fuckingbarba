import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRIMEIRO_PEDIDO_DA_LOJA_NOVA } from "../../migration-scripts/numeracao-depois-da-nuvemshop"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
import { emReais } from "../emails/moldura"
import { limparCodigo, transportadoraPeloCodigo } from "../envios/situacao"
import { estadoDaSessao, sessaoDoParceiro } from "../pagamento/parceiros"

/**
 * OS PEDIDOS QUE O ATENDENTE DO WHATSAPP ENXERGA — os da loja nova (do
 * #3301 em diante), com a situação que a Minha conta mostra, o Pix que ainda
 * vale e o rastreio de cada pacote.
 *
 * A SITUAÇÃO é a mesma conta da Minha conta (`situacaoDe`, em `apps/loja/
 * src/lib/pedidos-da-conta.ts`): cancelado, entregue, enviado, e pelo
 * pagamento — o Pix esperando (ou vencido, pelo relógio do servidor), a
 * análise do cartão, o pago. O envio do núcleo (`modules/envios`) conta
 * também: o pacote que a transportadora já entregou é "entregue", mesmo que
 * ninguém tenha marcado no admin.
 */

export { PRIMEIRO_PEDIDO_DA_LOJA_NOVA }

export type SituacaoNoWhatsapp =
  "pix" | "vencido" | "analise" | "pago" | "enviado" | "entregue" | "cancelado" | "processando"

export type EnvioNoWhatsapp = {
  codigo: string
  url: string | null
  transportadora: string | null
  situacao: string | null
  /** "atrasado" ou "nao_entregue", quando o núcleo percebeu. */
  alerta: string | null
  ultimo: { descricao: string; local: string | null; quando: Date } | null
}

export type PedidoNoWhatsapp = {
  id: string
  numero: number
  email: string | null
  feitoEm: Date
  itens: { nome: string; quantidade: number }[]
  total: number | null
  situacao: SituacaoNoWhatsapp
  /** Pago no Pix ou no cartão e depois cancelado: o dinheiro volta. Sem pagamento: nada a devolver. */
  foiPago: boolean
  /** O Pix que ainda vale: o copia e cola e até quando. */
  pix: { codigo: string; vence: Date } | null
  envios: EnvioNoWhatsapp[]
}

const NO_CAMINHO = new Set(["postado", "em_transito", "saiu_para_entrega", "aguardando_retirada"])

type Sessao = { provider_id?: string | null; status?: string | null; data?: unknown }

/** A situação do pedido, como a Minha conta diz. Pura. */
export function situacaoDoPedido(
  p: {
    status?: string | null
    fulfillment_status?: string | null
    sessoes: Sessao[]
    envios: { situacao: string | null }[]
  },
  agora: Date
): { situacao: SituacaoNoWhatsapp; pix: PedidoNoWhatsapp["pix"]; foiPago: boolean } {
  const estado = estadoDaSessao(sessaoDoParceiro(p.sessoes))
  const foiPago = estado?.situacao === "pago" || estado?.situacao === "estornado"
  if (p.status === "canceled" || estado?.situacao === "cancelado")
    return { situacao: "cancelado", pix: null, foiPago }
  const envio = p.fulfillment_status ?? ""
  if (/delivered/.test(envio) || p.envios.some((e) => e.situacao === "entregue"))
    return { situacao: "entregue", pix: null, foiPago: true }
  if (/shipped/.test(envio) || p.envios.some((e) => NO_CAMINHO.has(e.situacao ?? "")))
    return { situacao: "enviado", pix: null, foiPago: true }
  switch (estado?.situacao) {
    case "aguardando": {
      const vence = estado.pix?.expiraEm ? new Date(estado.pix.expiraEm) : null
      if (estado.pix && vence && vence.getTime() > agora.getTime())
        return { situacao: "pix", pix: { codigo: estado.pix.copiaECola, vence }, foiPago: false }
      return { situacao: "vencido", pix: null, foiPago: false }
    }
    case "analise":
      return { situacao: "analise", pix: null, foiPago: false }
    case "pago":
      return { situacao: "pago", pix: null, foiPago: true }
    default:
      return { situacao: "processando", pix: null, foiPago }
  }
}

type PedidoLido = {
  id: string
  display_id?: number | string | null
  email?: string | null
  status?: string | null
  created_at: string | Date
  total?: unknown
  fulfillment_status?: string | null
  items?: { title?: string | null; product_title?: string | null; quantity?: unknown }[] | null
  payment_collections?: { payment_sessions?: Sessao[] | null }[] | null
  fulfillments?: {
    canceled_at?: unknown
    labels?: { tracking_number?: string | null; tracking_url?: string | null }[] | null
  }[]
}

/**
 * Os pedidos destes ids, ou o deste número — do mais novo pro mais velho.
 * Só os da loja nova: o número da Nuvemshop não existe aqui.
 */
export async function lerPedidosDoWhatsapp(
  container: MedusaContainer,
  filtro: { ids: string[] } | { numero: number },
  agora = new Date()
): Promise<PedidoNoWhatsapp[]> {
  if ("ids" in filtro && !filtro.ids.length) return []
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "created_at",
      "total",
      "fulfillment_status",
      // `items.*`: no Medusa 2.21 a quantidade do item do pedido é calculada (ver voltar-ao-checkout).
      "items.*",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.data",
      "fulfillments.canceled_at",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
    filters: {
      is_draft_order: false,
      ...("ids" in filtro ? { id: filtro.ids } : { display_id: String(filtro.numero) }),
    },
  })
  const pedidos = (data as unknown as PedidoLido[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  if (!pedidos.length) return []

  const lidos = await container
    .resolve<EnviosService>(ENVIOS)
    .listEnvios(
      { pedido_id: pedidos.map((p) => p.id) },
      { relations: ["eventos"], order: { created_at: "ASC" }, take: pedidos.length * 4 }
    )
  const enviosDe = new Map<string, EnvioNoWhatsapp[]>()
  for (const e of lidos as unknown as {
    pedido_id: string | null
    codigo: string | null
    url: string | null
    transportadora: string | null
    situacao: string | null
    alerta: string | null
    eventos?: { descricao: string; local: string | null; quando: Date | string; origem: string }[]
  }[]) {
    if (!e.pedido_id || !e.codigo) continue
    const eventos = [...(e.eventos ?? [])]
    const daTransportadora = eventos.filter((ev) => ev.origem !== "loja")
    const ultimo = (daTransportadora.length ? daTransportadora : eventos).sort(
      (a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime()
    )[0]
    enviosDe.set(e.pedido_id, [
      ...(enviosDe.get(e.pedido_id) ?? []),
      {
        codigo: e.codigo,
        url: e.url,
        transportadora: e.transportadora,
        situacao: e.situacao,
        alerta: e.alerta,
        ultimo: ultimo
          ? { descricao: ultimo.descricao, local: ultimo.local, quando: new Date(ultimo.quando) }
          : null,
      },
    ])
  }

  return pedidos.map((p) => {
    const envios = enviosDe.get(p.id) ?? []
    // A etiqueta do admin que ainda não virou envio do núcleo: código e link, sem histórico.
    const conhecidos = new Set(envios.map((e) => e.codigo))
    for (const f of p.fulfillments ?? []) {
      if (f.canceled_at) continue
      for (const l of f.labels ?? []) {
        const codigo = limparCodigo(l.tracking_number)
        if (!codigo || conhecidos.has(codigo)) continue
        conhecidos.add(codigo)
        envios.push({
          codigo,
          url: typeof l.tracking_url === "string" ? l.tracking_url : null,
          transportadora: transportadoraPeloCodigo(codigo),
          situacao: null,
          alerta: null,
          ultimo: null,
        })
      }
    }
    const { situacao, pix, foiPago } = situacaoDoPedido(
      {
        status: p.status,
        fulfillment_status: p.fulfillment_status,
        sessoes: (p.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? []),
        envios,
      },
      agora
    )
    const total = Number(p.total)
    return {
      id: p.id,
      numero: Number(p.display_id),
      email: p.email ?? null,
      feitoEm: new Date(p.created_at),
      itens: (p.items ?? []).map((i) => ({
        nome: (i.product_title ?? i.title ?? "produto").trim(),
        quantidade: Math.max(1, Number(i.quantity) || 1),
      })),
      total: Number.isFinite(total) ? total : null,
      situacao,
      foiPago,
      pix,
      envios,
    }
  })
}

/* ── o texto pra IA ───────────────────────────────────────────────────────── */

const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})
const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const FRASES: Record<SituacaoNoWhatsapp, string> = {
  pix: "esperando o pagamento do Pix",
  vencido:
    "o Pix venceu sem pagamento (o pedido é cancelado sozinho em alguns minutos; nada foi cobrado)",
  analise: "pagamento no cartão em análise de segurança (o valor fica só reservado até aprovar)",
  pago: "pago, sendo separado pra envio",
  enviado: "enviado",
  entregue: "entregue",
  cancelado: "cancelado",
  processando: "recebido, esperando a confirmação do pagamento",
}

/** A situação em duas palavras, pro painel (a conversa, "Último pedido"). */
export const SITUACAO_CURTA: Record<SituacaoNoWhatsapp, string> = {
  pix: "esperando o Pix",
  vencido: "Pix vencido",
  analise: "cartão em análise",
  pago: "pago",
  enviado: "enviado",
  entregue: "entregue",
  cancelado: "cancelado",
  processando: "recebido",
}

const SITUACOES_DO_ENVIO: Record<string, string> = {
  aguardando: "etiqueta criada, esperando a postagem",
  postado: "postado",
  em_transito: "em trânsito",
  saiu_para_entrega: "saiu pra entrega",
  aguardando_retirada: "esperando retirada na agência",
  entregue: "entregue",
  devolvido: "DEVOLVIDO ao remetente",
  extraviado: "EXTRAVIADO",
}

/**
 * O pedido em texto, pro atendente. `dono`: o pedido é do número que está
 * escrevendo — vão os produtos e o total; de quem confirmou só pelo número e
 * pelo e-mail, só a situação e o rastreio. Pura.
 */
export function pedidoEmTexto(p: PedidoNoWhatsapp, { dono }: { dono: boolean }): string {
  const linhas = [`Pedido #${p.numero}, feito em ${DIA.format(p.feitoEm)}`]
  if (dono) {
    linhas.push(`Produtos: ${p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", ")}`)
    if (p.total !== null) linhas.push(`Total: ${emReais(p.total)}`)
  }
  let situacao = FRASES[p.situacao]
  if (p.situacao === "cancelado")
    situacao += p.foiPago
      ? " (o valor pago é devolvido: o Pix volta pra conta que pagou; no cartão, o estorno aparece nesta fatura ou na próxima)"
      : " (nada foi cobrado)"
  linhas.push(`Situação: ${situacao}`)
  if (p.pix) linhas.push(`O Pix vale até ${HORA.format(p.pix.vence)}.`)
  for (const e of p.envios) {
    const partes = [`Rastreio: ${e.codigo}`]
    if (e.transportadora) partes.push(`(${e.transportadora})`)
    if (e.situacao && SITUACOES_DO_ENVIO[e.situacao])
      partes.push(`— ${SITUACOES_DO_ENVIO[e.situacao]}`)
    if (e.alerta === "atrasado") partes.push("— ATRASADO pela transportadora")
    if (e.alerta === "nao_entregue") partes.push("— a transportadora NÃO CONSEGUIU ENTREGAR")
    if (e.url) partes.push(`— acompanhar: ${e.url}`)
    linhas.push(partes.join(" "))
    if (e.ultimo)
      linhas.push(
        `Último movimento: ${e.ultimo.descricao}${e.ultimo.local ? `, ${e.ultimo.local}` : ""} (${HORA.format(e.ultimo.quando)})`
      )
  }
  if ((p.situacao === "pago" || p.situacao === "enviado") && !p.envios.length && dono)
    linhas.push("Ainda sem código de rastreio.")
  return linhas.join("\n")
}

/** O pedido é da Nuvemshop (o número de antes da virada)? */
export const daLojaAntiga = (numero: number) => numero > 0 && numero < PRIMEIRO_PEDIDO_DA_LOJA_NOVA
