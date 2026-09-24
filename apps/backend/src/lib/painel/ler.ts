import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import type EnviosService from "../../modules/envios/service"
import { ERP } from "../../modules/erp"
import type ErpService from "../../modules/erp/service"
import { NEWSLETTER } from "../../modules/newsletter"
import type NewsletterService from "../../modules/newsletter/service"
import { lerConexao, minutosDaJanela } from "../erp/conexao"
import { erpDaLoja } from "../erp/erps"
import { ACOES_NO_PEDIDO, type FeitoNoPedido } from "./acoes"
import { ACOES_NO_PRODUTO, type FeitoNoProduto } from "./produtos"
import { nomeCurto, type Contexto, type EnvioCru, type NotaCrua, type PedidoCru } from "./pedido"

/**
 * O QUE O PAINEL LÊ DO BANCO pros pedidos — e só lê: nada aqui escreve.
 *
 * Os pedidos vêm do Medusa (`query.graph`); a nota e os envios, das nossas
 * tabelas (`erp_nota`, `envio`), numa consulta só pra lista inteira. Quem
 * decide o que aparece na tela é o `pedido.ts`, ao lado.
 *
 * OS RECENTES, E NÃO TODOS: a lista trabalha com os últimos pedidos (300), e
 * o Início com os dos últimos 45 dias. A loja é pequena e isso cobre com
 * folga o que alguém procura no dia a dia; o pedido mais velho se acha pelo
 * número (`pedidoPorNumero`).
 */

/** O que a lista e o Início leem de cada pedido. */
const CAMPOS_DA_LISTA = [
  "id",
  "display_id",
  "created_at",
  "canceled_at",
  "status",
  "email",
  "total",
  "original_total",
  "metadata",
  "customer.has_account",
  "items.id",
  "items.title",
  "items.product_title",
  "items.product_id",
  "items.thumbnail",
  "items.quantity",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.city",
  "shipping_address.province",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
  "payment_collections.payment_sessions.created_at",
  "payment_collections.payment_sessions.data",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.canceled_at",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.refunds.amount",
  "payment_collections.payments.refunds.created_at",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

/** O pedido inteiro: o da lista, e o que só o detalhe mostra. */
const CAMPOS_DO_DETALHE = [
  ...CAMPOS_DA_LISTA,
  "item_subtotal",
  "discount_total",
  "shipping_total",
  "items.variant_title",
  "items.variant_sku",
  "items.unit_price",
  "items.compare_at_unit_price",
  "items.total",
  "items.adjustments.code",
  "items.adjustments.amount",
  "shipping_address.phone",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.postal_code",
  "shipping_address.metadata",
  "billing_address.metadata",
  "shipping_methods.name",
  "fulfillments.created_at",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
]

const DIA_MS = 24 * 60 * 60 * 1000

export async function lerContexto(
  container: MedusaContainer,
  agora = new Date()
): Promise<Contexto> {
  const erp = erpDaLoja()
  if (!erp) return { agora, notasDesde: null, janelaDaNota: 0 }
  const linha = await lerConexao(container, erp)
  return {
    agora,
    notasDesde: linha?.notas_desde ? new Date(linha.notas_desde) : null,
    janelaDaNota: minutosDaJanela(linha),
  }
}

const query = (container: MedusaContainer) => container.resolve(ContainerRegistrationKeys.QUERY)

/** Os pedidos mais novos primeiro: os `limite` últimos, ou os dos últimos `dias`. */
export async function pedidosRecentes(
  container: MedusaContainer,
  { limite, dias, agora = new Date() }: { limite: number; dias?: number; agora?: Date }
): Promise<PedidoCru[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: CAMPOS_DA_LISTA,
    filters: {
      is_draft_order: false,
      ...(dias ? { created_at: { $gte: new Date(agora.getTime() - dias * DIA_MS) } } : {}),
    },
    pagination: { take: limite, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoCru[]
}

export async function pedidoPorId(
  container: MedusaContainer,
  id: string
): Promise<PedidoCru | null> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: CAMPOS_DO_DETALHE,
    filters: { id, is_draft_order: false },
  })
  return ((data as unknown as PedidoCru[])[0] as PedidoCru | undefined) ?? null
}

/**
 * Pro pedido fora da janela da lista: a busca pelo número vai direto nele.
 *
 * O número vai como TEXTO: é assim que o esquema do `query` descreve o
 * `display_id` do pedido (os tipos que o build gera recusam número). No
 * banco a coluna é número, e o Postgres compara "12" com 12 do mesmo jeito.
 */
export async function pedidoPorNumero(
  container: MedusaContainer,
  numero: number
): Promise<PedidoCru | null> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: CAMPOS_DA_LISTA,
    filters: { display_id: String(numero), is_draft_order: false },
  })
  return ((data as unknown as PedidoCru[])[0] as PedidoCru | undefined) ?? null
}

export async function notasDos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, NotaCrua>> {
  if (!ids.length) return new Map()
  const linhas = (await container
    .resolve<ErpService>(ERP)
    .listNotas({ pedido_id: ids }, { take: ids.length })) as unknown as (NotaCrua & {
    pedido_id: string
  })[]
  return new Map(linhas.map((n) => [n.pedido_id, n]))
}

export async function enviosDos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, EnvioCru[]>> {
  if (!ids.length) return new Map()
  const linhas = (await container
    .resolve<EnviosService>(ENVIOS)
    .listEnvios({ pedido_id: ids }, { take: ids.length * 4 })) as unknown as (EnvioCru & {
    pedido_id: string | null
  })[]
  const porPedido = new Map<string, EnvioCru[]>()
  for (const e of linhas) {
    if (!e.pedido_id) continue
    porPedido.set(e.pedido_id, [...(porPedido.get(e.pedido_id) ?? []), e])
  }
  return porPedido
}

/**
 * O que a equipe fez no pedido pelo painel ("Emitir a nota agora", "Tentar o
 * estorno de novo"), do registro da equipe, com o nome de quem fez — mesmo
 * de quem já saiu da equipe: o registro não se apaga.
 */
export async function feitosNoPedido(
  container: MedusaContainer,
  pedidoId: string
): Promise<FeitoNoPedido[]> {
  const equipe = container.resolve<EquipeService>(EQUIPE)
  const linhas = (await equipe.listRegistros(
    { alvo_id: pedidoId, acao: ACOES_NO_PEDIDO },
    { take: 50, order: { created_at: "ASC" } }
  )) as unknown as {
    membro_id: string | null
    acao: string
    detalhe: Record<string, unknown> | null
    created_at: Date
  }[]
  const ids = [...new Set(linhas.map((l) => l.membro_id).filter((id): id is string => !!id))]
  const membros = ids.length
    ? ((await equipe.listMembros({ id: ids }, { take: ids.length })) as {
        id: string
        nome: string
      }[])
    : []
  const nomes = new Map(membros.map((m) => [m.id, m.nome]))
  return linhas.map((l) => ({
    em: l.created_at,
    acao: l.acao,
    quem: (l.membro_id && nomes.get(l.membro_id)) || "Alguém da equipe",
    detalhe: l.detalhe,
  }))
}

/**
 * O que a equipe mudou no produto pelo painel (uma seção, a ordem, a caixa
 * de compra, os textos, o "Publicar"), do registro, o mais novo primeiro —
 * com o nome de quem fez.
 */
export async function feitosNoProduto(
  container: MedusaContainer,
  produtoId: string
): Promise<FeitoNoProduto[]> {
  const equipe = container.resolve<EquipeService>(EQUIPE)
  const linhas = (await equipe.listRegistros(
    { alvo_id: produtoId, acao: [...ACOES_NO_PRODUTO] },
    { take: 20, order: { created_at: "DESC" } }
  )) as unknown as {
    membro_id: string | null
    acao: string
    detalhe: Record<string, unknown> | null
    created_at: Date
  }[]
  const ids = [...new Set(linhas.map((l) => l.membro_id).filter((id): id is string => !!id))]
  const membros = ids.length
    ? ((await equipe.listMembros({ id: ids }, { take: ids.length })) as {
        id: string
        nome: string
      }[])
    : []
  const nomes = new Map(membros.map((m) => [m.id, m.nome]))
  return linhas.map((l) => ({
    em: l.created_at,
    acao: l.acao,
    quem: (l.membro_id && nomes.get(l.membro_id)) || "Alguém da equipe",
    detalhe: l.detalhe,
  }))
}

/** O nome curto de cada produto, pelo handle — pros mais vistos das visitas. */
export async function nomesDosProdutos(
  container: MedusaContainer,
  handles: string[]
): Promise<Map<string, string>> {
  if (!handles.length) return new Map()
  const { data } = await query(container).graph({
    entity: "product",
    fields: ["handle", "title"],
    filters: { handle: handles },
  })
  return new Map(
    (data as { handle: string; title: string }[]).map((p) => [p.handle, nomeCurto(p.title)])
  )
}

/** Marketing: a newsletter da semana e o total. */
export async function numerosDaNewsletter(
  container: MedusaContainer,
  agora = new Date()
): Promise<{ semana: number; total: number }> {
  const servico = container.resolve<NewsletterService>(NEWSLETTER)
  const [, total] = await servico.listAndCountInscricoes({}, { take: 1 })
  const [, semana] = await servico.listAndCountInscricoes(
    { created_at: { $gte: new Date(agora.getTime() - 7 * DIA_MS) } },
    { take: 1 }
  )
  return { semana, total }
}

/** Marketing: quantos produtos esperam alguém completar (os rascunhos que vêm do Bling). */
export async function quantosRascunhos(container: MedusaContainer): Promise<number> {
  const { metadata } = await query(container).graph({
    entity: "product",
    fields: ["id"],
    filters: { status: "draft" },
    pagination: { take: 1 },
  })
  return Number(metadata?.count ?? 0)
}
