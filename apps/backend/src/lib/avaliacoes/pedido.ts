import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { normalizarEmail } from "../../modules/codigo/regras"
import {
  aceitaAvaliacao,
  nomeSugerido,
  produtosDoPedido,
  type ItemDoPedido,
  type ProdutoDoPedido,
} from "./regras"

/**
 * O PEDIDO DO LINK — o que a página `/avaliar` mostra, e o que a rota que
 * recebe a avaliação confere: o número, a sugestão de nome e os produtos,
 * cada um dizendo se já tem avaliação deste pedido.
 *
 * Nada além disso sai daqui: nem o e-mail, nem o endereço, nem o sobrenome
 * inteiro. Quem tem o link é quem recebeu o e-mail — ou alguém a quem ele
 * encaminhou —, e pra dar nota a um produto ninguém precisa de mais.
 */

type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  items?: (ItemDoPedido | null)[] | null
  shipping_address?: { first_name?: string | null; last_name?: string | null } | null
  payment_collections?: ({ payments?: ({ captured_at?: unknown } | null)[] | null } | null)[] | null
}

const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  // O item inteiro: `product_id`, `product_title`, `product_handle` e a foto
  // moram na linha, e é assim que os e-mails do pedido leem (AGENTS.md, "A
  // quantidade do item do pedido").
  "items.*",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "payment_collections.payments.captured_at",
]

const pago = (o: PedidoLido) =>
  (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .some((p) => Boolean(p?.captured_at))

export type ProdutoParaAvaliar = ProdutoDoPedido & { avaliado: boolean }

export type PedidoParaAPagina = {
  id: string
  numero: number
  /** A sugestão do campo de nome ("Rafael S."), ou vazio. */
  nome: string
  produtos: ProdutoParaAvaliar[]
}

export type LeituraDoPedido =
  | { ok: true; pedido: PedidoParaAPagina }
  /** `sem_pedido`: o id não existe (apagado). `nao_aceita`: cancelado, ou sem pagamento. */
  | { ok: false; motivo: "sem_pedido" | "nao_aceita" }

/** Os produtos deste pedido que já têm avaliação. */
export async function produtosAvaliados(
  container: MedusaContainer,
  pedidoId: string
): Promise<Set<string>> {
  const avaliacoes = await container
    .resolve<AvaliacoesService>(AVALIACOES)
    .listAvaliacoes({ pedido_id: pedidoId }, { select: ["produto_id"], take: 200 })
  return new Set(avaliacoes.map((a) => a.produto_id))
}

export async function lerPedidoParaAvaliar(
  container: MedusaContainer,
  pedidoId: string
): Promise<LeituraDoPedido> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: CAMPOS,
    filters: { id: pedidoId },
  })
  const o = data[0] as unknown as PedidoLido | undefined
  if (!o) return { ok: false, motivo: "sem_pedido" }
  if (!aceitaAvaliacao({ status: o.status, pago: pago(o) }))
    return { ok: false, motivo: "nao_aceita" }
  const avaliados = await produtosAvaliados(container, o.id)
  return {
    ok: true,
    pedido: {
      id: o.id,
      numero: Number(o.display_id ?? 0),
      nome: nomeSugerido(o.shipping_address?.first_name, o.shipping_address?.last_name),
      produtos: produtosDoPedido(o.items ?? []).map((p) => ({
        ...p,
        avaliado: avaliados.has(p.id),
      })),
    },
  }
}

/**
 * O pedido de quem abriu a página SEM o link: o número (como está no e-mail
 * de confirmação, "#1234") e o e-mail da compra. Os dois têm que bater — o
 * número sozinho é sequencial, e daria pra avaliar pelo pedido de qualquer
 * um. `null` pra qualquer diferença, sem dizer qual.
 */
export async function encontrarPedido(
  container: MedusaContainer,
  numero: number,
  email: string
): Promise<string | null> {
  const procurado = normalizarEmail(email)
  if (!procurado || !Number.isSafeInteger(numero) || numero <= 0) return null
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "email"],
    filters: { display_id: numero },
  })
  const o = data[0] as unknown as { id: string; email?: string | null } | undefined
  if (!o?.email || normalizarEmail(o.email) !== procurado) return null
  return o.id
}
