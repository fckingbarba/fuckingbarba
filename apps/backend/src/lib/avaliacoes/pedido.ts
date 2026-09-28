import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import {
  aceitaAvaliacao,
  nomeSugerido,
  produtosDoPedido,
  produtosQueOPedidoAvalia,
  type ItemDoPedido,
  type ProdutoDoCatalogo,
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
 *
 * SEM O LINK (`acharPedidoDireto`, no fim), o pedido vem do número e do
 * e-mail da compra, na loja nova ou na base da Nuvemshop — e nada dele volta
 * pra página: a lista de produtos é a da loja inteira, e a rota só diz se a
 * avaliação entrou.
 */

type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  items?: ((ItemDoPedido & { variant_sku?: string | null }) | null)[] | null
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
 * O pedido da loja nova pelo número (como está no e-mail de confirmação,
 * "#1234") e o e-mail da compra. Os dois têm que bater — o número sozinho é
 * sequencial, e daria pra avaliar pelo pedido de qualquer um. `null` pra
 * qualquer diferença, sem dizer qual.
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
    // Texto, como o `pedidoPorNumero` do painel: os tipos que o `medusa build`
    // gera recusam número no `display_id`, e o Postgres compara "12" com 12.
    filters: { display_id: String(numero), is_draft_order: false },
  })
  const o = data[0] as unknown as { id: string; email?: string | null } | undefined
  if (!o?.email || normalizarEmail(o.email) !== procurado) return null
  return o.id
}

/* ── o pedido pelo número e o e-mail (a página sem o link) ────────────────── */

export type PedidoDireto = {
  /** `order_…` (a loja nova) ou `nso_…` (a linha da base da Nuvemshop). */
  id: string
  numero: number
  origem: "loja" | "nuvemshop"
  /** Os produtos que o pedido deixa avaliar, com o nome (`produtosQueOPedidoAvalia`). */
  produtos: Map<string, string>
}

export type LeituraDireta =
  | { ok: true; pedido: PedidoDireto }
  /**
   * `sem_pedido`: nenhum pedido com esse número E esse e-mail, nas duas
   * lojas. `nao_aceita`: achou, mas cancelado ou sem pagamento.
   */
  | { ok: false; motivo: "sem_pedido" | "nao_aceita" }

/** Os produtos publicados, com os SKUs: a ponte do SKU da Nuvemshop pro produto de hoje. */
async function catalogoPublicado(container: MedusaContainer): Promise<ProdutoDoCatalogo[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "title", "variants.sku"],
    filters: { status: ProductStatus.PUBLISHED },
  })
  return (
    data as {
      id: string
      title?: string | null
      variants?: ({ sku?: string | null } | null)[] | null
    }[]
  ).map((p) => ({
    id: p.id,
    nome: p.title?.trim() || "Produto",
    skus: (p.variants ?? []).map((v) => v?.sku),
  }))
}

/**
 * O PEDIDO DE QUEM ABRIU A PÁGINA SEM O LINK — pelo número e o e-mail da
 * compra, que têm que bater. Procura na loja nova (o Medusa) e, sem achar lá,
 * na base da Nuvemshop que o CRM guardou (`crm_base_pedido`, o arquivo de
 * vendas importado em CRM → Base da Nuvemshop): quem comprou na loja antiga
 * também avalia. A numeração da loja nova começa depois da última de lá, então
 * um número é de uma loja só.
 *
 * Aceita avaliação o pedido pago e não cancelado — na Nuvemshop, o
 * "confirmado" (o recusado nunca foi pago, o estornado voltou).
 */
export async function acharPedidoDireto(
  container: MedusaContainer,
  numero: number,
  email: string
): Promise<LeituraDireta> {
  const [daLoja, catalogo] = await Promise.all([
    encontrarPedido(container, numero, email),
    catalogoPublicado(container),
  ])

  if (daLoja) {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: CAMPOS,
      filters: { id: daLoja },
    })
    const o = data[0] as unknown as PedidoLido | undefined
    if (!o) return { ok: false, motivo: "sem_pedido" }
    if (!aceitaAvaliacao({ status: o.status, pago: pago(o) }))
      return { ok: false, motivo: "nao_aceita" }
    const itens = (o.items ?? []).flatMap((i) =>
      i
        ? [
            {
              produtoId: i.product_id,
              nome: i.product_title ?? i.title,
              sku: i.variant_sku,
              handle: i.product_handle,
            },
          ]
        : []
    )
    return {
      ok: true,
      pedido: {
        id: o.id,
        numero: Number(o.display_id ?? numero),
        origem: "loja",
        produtos: produtosQueOPedidoAvalia(itens, catalogo),
      },
    }
  }

  const procurado = normalizarEmail(email)
  if (!procurado) return { ok: false, motivo: "sem_pedido" }
  const daBase = (await container.resolve<CrmService>(CRM).pedidosDaBase(procurado)).find(
    (p) => String(p.numero).trim() === String(numero)
  )
  if (!daBase?.id) return { ok: false, motivo: "sem_pedido" }
  if (daBase.pagamento !== "confirmado") return { ok: false, motivo: "nao_aceita" }
  return {
    ok: true,
    pedido: {
      id: daBase.id,
      numero,
      origem: "nuvemshop",
      produtos: produtosQueOPedidoAvalia(
        (daBase.itens ?? []).map((i) => ({ sku: i.sku, nome: i.nome })),
        catalogo
      ),
    },
  }
}
