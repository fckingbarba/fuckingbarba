import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { gravarNoMetadataDoPedido, lerNoCaminho } from "./metadata-do-pedido"

/**
 * O USO DO CUPOM VOLTA QUANDO O PEDIDO É CANCELADO.
 *
 * O Medusa conta o uso de cada código (`used`, contra o `limit` — o
 * "Limitado" do painel) no fechamento do carrinho, e o Pix GERADO já conta,
 * antes de ser pago. Ele só desfaz a conta se o próprio fechamento falhar (o
 * `registerUsageStep`, em `core-flows/dist/promotion/steps/register-usage.js`);
 * cancelar o pedido não mexe nas promoções. Com 74 dos 104 cupons da
 * Nuvemshop valendo 1 uso, o Pix que venceu sem ser pago queimava o cupom: a
 * pessoa voltava pra pagar no cartão e ouvia "Esse cupom não vale pra este
 * pedido", e o painel mostrava "1 de 1 usos · Esgotado" com nenhum pedido
 * (entrega 0136). O "por cliente" já ignorava pedido cancelado
 * (`contextoDosCupons`, em `lib/cupons.ts`); o limite total não.
 *
 * Aqui o pedido cancelado devolve o que o fechamento registrou — um por
 * ajuste com código, de produto e de frete, com o valor, igual ao
 * `complete-cart` do Medusa —, pelo `revertUsage` dele, que nunca desce de
 * zero. Só entram os códigos que CONTAM uso — com limite, ou com orçamento de
 * campanha (`contaUso`); a oferta do checkout (BUMP-) e o cupom ilimitado não
 * contam, e o pedido que só tem deles não ganha registro nem linha de log.
 *
 * UMA VEZ SÓ POR PEDIDO: o registro `fb_cupons.uso_devolvido` entra no
 * metadata ANTES da devolução, dentro da trava do metadata do pedido
 * (`gravarNoMetadataDoPedido`). O evento repetido e a varredura da migração
 * não devolvem de novo. Se a devolução falhar depois do registro, fica como
 * era antes desta entrega — o uso não volta, e o log diz qual pedido —, mas
 * nunca devolve em dobro.
 */

export const CAMINHO_DA_DEVOLUCAO = ["fb_cupons", "uso_devolvido"] as const

type Ajuste = { code?: string | null; amount?: unknown } | null
type Linha = { adjustments?: Ajuste[] | null } | null

/** O pedido como a consulta daqui devolve. */
export type PedidoDoUso = {
  id: string
  status?: string | null
  email?: string | null
  customer_id?: string | null
  metadata?: Record<string, unknown> | null
  items?: Linha[] | null
  shipping_methods?: Linha[] | null
}

export const CAMPOS_DO_USO = [
  "id",
  "status",
  "email",
  "customer_id",
  "metadata",
  "items.adjustments.code",
  "items.adjustments.amount",
  "shipping_methods.adjustments.code",
  "shipping_methods.adjustments.amount",
]

export type UsoDoPedido = {
  acoes: { code: string; amount: number }[]
  contexto: { customer_id: string | null; customer_email: string | null }
}

/** O que o fechamento do carrinho registrou pra este pedido. */
export function usoDoPedido(p: PedidoDoUso): UsoDoPedido {
  const acoes = [...(p.items ?? []), ...(p.shipping_methods ?? [])]
    .flatMap((linha) => linha?.adjustments ?? [])
    .flatMap((a) => (a?.code ? [{ code: a.code, amount: Number(a.amount ?? 0) || 0 }] : []))
  return {
    acoes,
    contexto: { customer_id: p.customer_id ?? null, customer_email: p.email ?? null },
  }
}

export type DecisaoDaDevolucao =
  | ({ devolver: true; codigos: string[] } & UsoDoPedido)
  | { devolver: false; motivo: "nao-cancelado" | "ja-devolvido" | "sem-cupom" }

export function decidirDevolucao(p: PedidoDoUso): DecisaoDaDevolucao {
  if (p.status !== "canceled") return { devolver: false, motivo: "nao-cancelado" }
  if (lerNoCaminho(p.metadata, CAMINHO_DA_DEVOLUCAO))
    return { devolver: false, motivo: "ja-devolvido" }
  const uso = usoDoPedido(p)
  if (!uso.acoes.length) return { devolver: false, motivo: "sem-cupom" }
  return { devolver: true, codigos: [...new Set(uso.acoes.map((a) => a.code))], ...uso }
}

/** A promoção como a consulta daqui devolve: o código, o limite e o orçamento da campanha. */
export type PromocaoDoUso = {
  code?: string | null
  limit?: number | null
  campaign?: { budget?: { id?: string } | null } | null
}

/** Só o que conta uso volta: código com limite, ou com orçamento de campanha. */
export function contaUso(acoes: UsoDoPedido["acoes"], promocoes: PromocaoDoUso[]) {
  const contam = new Set(
    promocoes
      .filter((p) => p.code && (typeof p.limit === "number" || Boolean(p.campaign?.budget)))
      .map((p) => p.code as string)
  )
  return acoes.filter((a) => contam.has(a.code))
}

export type DevolucaoDoUso =
  | { resultado: "devolveu"; codigos: string[] }
  | {
      resultado: "nada"
      motivo: "sem-pedido" | "nao-cancelado" | "ja-devolvido" | "sem-cupom" | "sem-limite"
    }

/** Devolve o uso dos cupons de UM pedido cancelado — uma vez só. */
export async function devolverUsoDosCupons(
  container: MedusaContainer,
  pedidoId: string,
  agora = new Date()
): Promise<DevolucaoDoUso> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: CAMPOS_DO_USO,
    filters: { id: pedidoId },
  })
  const pedido = data[0] as unknown as PedidoDoUso | undefined
  if (!pedido) return { resultado: "nada", motivo: "sem-pedido" }
  const decisao = decidirDevolucao(pedido)
  if (!decisao.devolver) return { resultado: "nada", motivo: decisao.motivo }

  const modulo = container.resolve(Modules.PROMOTION)
  const promocoes = await modulo.listPromotions(
    { code: decisao.codigos },
    { select: ["id", "code", "limit"], relations: ["campaign", "campaign.budget"] }
  )
  const acoes = contaUso(decisao.acoes, promocoes as PromocaoDoUso[])
  if (!acoes.length) return { resultado: "nada", motivo: "sem-limite" }
  const codigos = [...new Set(acoes.map((a) => a.code))]

  // O registro antes, na trava: quem chegar depois lê o registro e não devolve.
  const registro = { em: agora.toISOString(), codigos }
  const marcou = await gravarNoMetadataDoPedido(
    container,
    pedidoId,
    CAMINHO_DA_DEVOLUCAO,
    (atual: unknown) => (atual ? undefined : registro)
  )
  if (!marcou) return { resultado: "nada", motivo: "ja-devolvido" }

  await modulo.revertUsage(acoes, decisao.contexto)
  return { resultado: "devolveu", codigos }
}
