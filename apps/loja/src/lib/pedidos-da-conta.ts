import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { lerSessao, medusa } from "./conta"
import {
  ALERTAS_DO_ENVIO,
  SITUACOES_DO_ENVIO,
  TIPOS_DE_EVENTO,
  type AlertaDoEnvio,
  type SituacaoDoEnvio,
  type SituacaoDoPedido,
  type TipoDeEvento,
} from "./conta-visivel"
import { devolvidoNoPagarme } from "./pagamento"
import { CAMPOS_DO_PEDIDO, paraPedidoVisivel, type PedidoVisivel } from "./pedido"

/**
 * OS PEDIDOS DE QUEM ESTÁ NA CONTA.
 *
 * ┌─ QUEM DIZ DE QUEM É O PEDIDO É O MEDUSA ───────────────────────────────┐
 * │ Tudo sai de `GET /store/orders` com o token da sessão, e essa rota só  │
 * │ devolve pedido do cliente do token. O detalhe também vem por ela       │
 * │ (`?id=`), e não por `/store/orders/:id` — que, pra quem só tem o id,   │
 * │ responde a versão pública (número e situação). Pedido de outra pessoa  │
 * │ não é "proibido" aqui: ele simplesmente não aparece, e a tela diz que  │
 * │ não achou.                                                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O convidado que comprou antes de ter conta VIROU a conta no primeiro
 * código (`/store/conta/vincular`), com o mesmo id — por isso os pedidos
 * antigos dele aparecem aqui sem cópia nem migração.
 */

export type PedidoDaConta = PedidoVisivel & {
  situacao: SituacaoDoPedido
  /** Datas em ISO; `null` é o que ainda não aconteceu. */
  datas: { feito: string; pago: string | null; enviado: string | null; entregue: string | null }
  /**
   * Os pacotes, com a linha do tempo de cada um (ver `Rastreio`). Só no
   * detalhe (`lerPedidoDaConta`): a lista não precisa, e custaria uma
   * pergunta a mais por pedido.
   */
  rastreios: Rastreio[]
  /**
   * Cancelado com dinheiro devolvido: o Medusa registrou o estorno, ou o
   * Pagar.me desfez a cobrança sozinho (ver `devolvidoNoPagarme`).
   */
  estornado: boolean
}

/**
 * UM PACOTE NA RUA — o que o núcleo dos envios sabe dele, no vocabulário
 * do núcleo (`conta-visivel.ts`), nunca no do parceiro. `situacao` é `null`
 * no código que o admin cadastrou antes de o núcleo existir: aí só há
 * código e link.
 */
export type Rastreio = {
  codigo: string
  url: string | null
  /** "Correios · PAC", quando se sabe. */
  quem: string | null
  situacao: SituacaoDoEnvio | null
  alerta: AlertaDoEnvio | null
  postadoEm: string | null
  entregueEm: string | null
  /** Do mais novo pro mais velho. */
  eventos: EventoDoRastreio[]
}

export type EventoDoRastreio = {
  tipo: TipoDeEvento
  /** O texto da transportadora. */
  descricao: string
  local: string | null
  quando: string
}

const CAMPOS_DA_CONTA = `${CAMPOS_DO_PEDIDO},fulfillment_status,*fulfillments,*payment_collections.payments`

/** Os ids do Medusa: `order_` e um ULID. Nada mais chega na API. */
const ID_DO_PEDIDO = /^order_[0-9A-Za-z]{10,40}$/

type Pagamento = { captured_at?: string | Date | null }
type Envio = {
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
}

const emTexto = (d: string | Date | null | undefined) =>
  d ? String(d instanceof Date ? d.toISOString() : d) : null

/**
 * ONDE O PEDIDO ESTÁ — e o Pix vencido é decidido AQUI, no servidor.
 *
 * O intervalo entre o QR vencer e o pedido ser cancelado é real: o Pagar.me
 * não cancela Pix pendente, e quem cancela o pedido é a conciliação do
 * backend, de 5 em 5 minutos, com 10 de folga depois do vencimento. Até uns
 * 15 minutos, portanto, o pedido está de pé com um QR que não serve mais.
 *
 * A comparação é feita com o relógio do SERVIDOR, e não com o do navegador:
 * o do celular pode estar minutos adiantado, e nenhum "Pix vencido" deve
 * aparecer antes da hora por causa disso. O que o navegador faz é só trocar
 * a frase se o Pix vencer com a tela aberta (ver `MinutosDoPix`).
 */
function situacaoDe(
  order: HttpTypes.StoreOrder,
  pedido: PedidoVisivel,
  agora: number
): SituacaoDoPedido {
  if (order.status === "canceled" || pedido.pagamento.estado === "cancelado") return "cancelado"
  const envio = order.fulfillment_status
  if (envio === "delivered" || envio === "partially_delivered") return "entregue"
  if (envio === "shipped" || envio === "partially_shipped") return "enviado"
  switch (pedido.pagamento.estado) {
    case "aguardando": {
      const expira = Date.parse(pedido.pagamento.pix?.expiraEm ?? "")
      return Number.isFinite(expira) && agora > expira ? "vencido" : "pix"
    }
    case "analise":
      return "analise"
    case "pago":
      return "pago"
    default:
      return "combinar"
  }
}

/** Só link de verdade: a etiqueta é texto livre do admin, e `javascript:` também é texto. */
function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

export function paraPedidoDaConta(order: HttpTypes.StoreOrder, agora = Date.now()): PedidoDaConta {
  const pedido = paraPedidoVisivel(order)
  const envios = ((order.fulfillments ?? []) as Envio[]).filter((f) => !f.canceled_at)
  const pagamentos = (order.payment_collections ?? []).flatMap(
    (c) => ((c as { payments?: Pagamento[] | null }).payments ?? []) as Pagamento[]
  )
  const primeira = (datas: (string | null)[]) =>
    datas.filter((d): d is string => Boolean(d)).sort()[0] ?? null

  return {
    ...pedido,
    situacao: situacaoDe(order, pedido, agora),
    datas: {
      feito: pedido.quando,
      pago: primeira(pagamentos.map((p) => emTexto(p.captured_at))),
      enviado: primeira(envios.map((f) => emTexto(f.shipped_at))),
      entregue: primeira(envios.map((f) => emTexto(f.delivered_at))),
    },
    rastreios: [],
    // As duas portas por onde o dinheiro volta: o estorno que o Medusa
    // registrou, e o que o Pagar.me desfez sem o Medusa ver (o cartão
    // reprovado pela análise depois de capturado — `devolvidoNoPagarme`).
    estornado:
      order.status === "canceled" &&
      (/refunded/.test(String(order.payment_status ?? "")) || devolvidoNoPagarme(order) > 0),
  }
}

type SemPedidos = { estado: "sem-sessao" } | { estado: "expirou" } | { estado: "fora-do-ar" }

export type LeituraDosPedidos = { estado: "ok"; pedidos: PedidoDaConta[] } | SemPedidos
export type LeituraDoPedido =
  { estado: "ok"; pedido: PedidoDaConta } | { estado: "nao-achei" } | SemPedidos

async function perguntar(
  busca: string
): Promise<{ estado: "ok"; orders: HttpTypes.StoreOrder[] } | SemPedidos> {
  const token = await lerSessao()
  if (!token) return { estado: "sem-sessao" }
  const r = await medusa(`/store/orders?${busca}&fields=${encodeURIComponent(CAMPOS_DA_CONTA)}`, {
    metodo: "GET",
    token,
  })
  if (r.status === 401) return { estado: "expirou" }
  const orders = r.corpo.orders
  if (r.status !== 200 || !Array.isArray(orders)) return { estado: "fora-do-ar" }
  return { estado: "ok", orders: orders as HttpTypes.StoreOrder[] }
}

/**
 * Os pedidos da conta, do mais novo pro mais velho. `cache` porque o menu (a
 * contagem) e a página (a lista) perguntam a mesma coisa no mesmo pedido de
 * página — uma ida ao Medusa só.
 *
 * Cinquenta é mais do que qualquer cliente desta loja tem hoje; quando
 * alguém chegar perto, a lista ganha "ver mais".
 */
export const listarPedidos = cache(async (): Promise<LeituraDosPedidos> => {
  const r = await perguntar("limit=50&order=-created_at")
  if (r.estado !== "ok") return r
  // A mesma hora pra lista inteira — e sem passar o índice do `map` como
  // `agora`, que é o que aconteceria com `.map(paraPedidoDaConta)`.
  const agora = Date.now()
  return { estado: "ok", pedidos: r.orders.map((o) => paraPedidoDaConta(o, agora)) }
})

/**
 * Um pedido, só se for da conta. Id fora do formato nem vai pro Medusa.
 *
 * O RASTREIO VEM DE OUTRA ROTA: `/store/conta/pedidos/:id/rastreio` (no
 * backend), que lê os envios do núcleo com o mesmo filtro de dono — a API
 * da loja nem sabe que eles existem. Se ela não responder, o pedido aparece
 * sem o rastreio — nunca sem o pedido.
 *
 * As datas de enviado e entregue passam a ser as da TRANSPORTADORA quando o
 * rastreio as tem: o Medusa marca a hora em que ficou sabendo, e o aviso
 * pode chegar horas depois do fato.
 */
export const lerPedidoDaConta = cache(async (id: string): Promise<LeituraDoPedido> => {
  if (!ID_DO_PEDIDO.test(id)) return { estado: "nao-achei" }
  const r = await perguntar(`id=${encodeURIComponent(id)}`)
  if (r.estado !== "ok") return r
  const order = r.orders.find((o) => o.id === id)
  if (!order) return { estado: "nao-achei" }

  const pedido = paraPedidoDaConta(order)
  if (pedido.situacao === "enviado" || pedido.situacao === "entregue") {
    pedido.rastreios = await lerRastreios(id)
    const postados = pedido.rastreios.map((x) => x.postadoEm).filter((d): d is string => Boolean(d))
    const entregues = pedido.rastreios
      .map((x) => x.entregueEm)
      .filter((d): d is string => Boolean(d))
    if (postados.length) pedido.datas.enviado = postados.sort()[0]!
    if (entregues.length && pedido.situacao === "entregue")
      pedido.datas.entregue = entregues.sort().at(-1)!
  }
  return { estado: "ok", pedido }
})

/**
 * Os pacotes de um pedido da conta. `cache` porque a visão geral pede os
 * dos pedidos a caminho, e o detalhe pede o dele — no mesmo pedido de
 * página, uma ida só.
 */
export const lerRastreios = cache(async (id: string): Promise<Rastreio[]> => {
  if (!ID_DO_PEDIDO.test(id)) return []
  const token = await lerSessao()
  if (!token) return []
  const r = await medusa(`/store/conta/pedidos/${encodeURIComponent(id)}/rastreio`, {
    metodo: "GET",
    token,
  })
  const lista = r.corpo.rastreios
  if (r.status !== 200 || !Array.isArray(lista)) return []
  return lista.map(paraRastreio).filter((x): x is Rastreio => x !== null)
})

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const umDe = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null

/** Um rastreio como a rota manda — conferido campo a campo: é rede, não confiança. */
function paraRastreio(bruto: unknown): Rastreio | null {
  const r = (bruto ?? {}) as Record<string, unknown>
  const codigo = texto(r.codigo)
  if (!codigo) return null
  const quem = [texto(r.transportadora), texto(r.servico)].filter(Boolean).join(" · ")
  const eventos = (Array.isArray(r.eventos) ? r.eventos : []).flatMap((e): EventoDoRastreio[] => {
    const x = (e ?? {}) as Record<string, unknown>
    const descricao = texto(x.descricao)
    const quando = texto(x.quando)
    if (!descricao || !quando || Number.isNaN(Date.parse(quando))) return []
    return [
      {
        tipo: umDe(TIPOS_DE_EVENTO, x.tipo) ?? "informativo",
        descricao,
        local: texto(x.local),
        quando,
      },
    ]
  })
  return {
    codigo,
    url: urlSegura(texto(r.url)),
    quem: quem || null,
    situacao: umDe(SITUACOES_DO_ENVIO, r.situacao),
    alerta: umDe(ALERTAS_DO_ENVIO, r.alerta),
    postadoEm: texto(r.postadoEm),
    entregueEm: texto(r.entregueEm),
    eventos,
  }
}

/**
 * O pedido é de quem está logado? Versão leve, pra espera do Pix — que
 * pergunta a cada quatro segundos e não precisa de item nenhum.
 */
export async function ehDaConta(id: string): Promise<boolean> {
  if (!ID_DO_PEDIDO.test(id)) return false
  const token = await lerSessao()
  if (!token) return false
  const r = await medusa(`/store/orders?id=${encodeURIComponent(id)}&fields=id`, {
    metodo: "GET",
    token,
  })
  const orders = r.corpo.orders
  return r.status === 200 && Array.isArray(orders) && orders.some((o) => o?.id === id)
}
