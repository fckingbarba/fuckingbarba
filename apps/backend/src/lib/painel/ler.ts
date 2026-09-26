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
import {
  juntarPessoas,
  newsletterDa,
  type ClienteCru,
  type InscricaoCrua,
  type PedidoDoCliente,
} from "./clientes"
import { ACOES_NA_HOME, ALVO_DA_HOME } from "./home"
import { ACOES_NO_PRODUTO, type FeitoNoProduto } from "./produtos"
import type { CarrinhoDoFunil } from "./marketing-funil"
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
  "credit_line_total",
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

/**
 * O que o Marketing lê de cada pedido: só o que as contas usam — o total, os
 * itens com o valor de cada um e quando o dinheiro entrou. Nada de cliente:
 * a resposta sai só com números.
 */
const CAMPOS_DAS_VENDAS = [
  "id",
  "created_at",
  "status",
  "total",
  "credit_line_total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.product_id",
  "items.thumbnail",
  "items.quantity",
  "items.total",
  "items.unit_price",
  "payment_collections.payments.captured_at",
]

/**
 * Os pedidos feitos desde `desde` — pro Marketing, que soma períodos de até
 * 180 dias. `comMetadata`: o funil lê o navegador do rastro da compra
 * (`fb_rastro`); o metadata não sai da rota, só a conta.
 */
export async function pedidosDesde(
  container: MedusaContainer,
  desde: Date,
  { comMetadata = false }: { comMetadata?: boolean } = {}
): Promise<PedidoCru[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: comMetadata ? [...CAMPOS_DAS_VENDAS, "metadata"] : CAMPOS_DAS_VENDAS,
    filters: { is_draft_order: false, created_at: { $gte: desde } },
    pagination: { take: 10_000, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoCru[]
}

/**
 * Os carrinhos criados desde `desde`, com o que o funil do Marketing usa: o
 * e-mail, o CEP, o frete escolhido, se fechou e o pedido que virou
 * (`funilDoCheckout`). Nada de nome, endereço ou telefone.
 */
export async function carrinhosDesde(
  container: MedusaContainer,
  desde: Date
): Promise<CarrinhoDoFunil[]> {
  const { data } = await query(container).graph({
    entity: "cart",
    fields: [
      "id",
      "created_at",
      "email",
      "completed_at",
      "items.id",
      "shipping_address.postal_code",
      "shipping_methods.id",
      "order.id",
    ],
    filters: { created_at: { $gte: desde } },
    pagination: { take: 20_000, order: { created_at: "DESC" } },
  })
  return data as unknown as CarrinhoDoFunil[]
}

/** Os produtos publicados (o endereço e o nome curto) — as páginas do montador de link. */
export async function produtosPublicados(
  container: MedusaContainer
): Promise<{ handle: string; nome: string }[]> {
  const { data } = await query(container).graph({
    entity: "product",
    fields: ["handle", "title"],
    filters: { status: "published" },
    pagination: { take: 200, order: { title: "ASC" } },
  })
  return (data as { handle: string; title: string }[])
    .filter((p) => p.handle)
    .map((p) => ({ handle: p.handle, nome: nomeCurto(p.title) }))
}

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
  return feitosNoAlvo(container, produtoId, ACOES_NO_PRODUTO)
}

/** O mesmo, na home: as seções, a ordem, o "Publicar" e o "Desfazer". */
export async function feitosNaHome(container: MedusaContainer): Promise<FeitoNoProduto[]> {
  return feitosNoAlvo(container, ALVO_DA_HOME, ACOES_NA_HOME)
}

async function feitosNoAlvo(
  container: MedusaContainer,
  alvo: string,
  acoes: readonly string[]
): Promise<FeitoNoProduto[]> {
  const equipe = container.resolve<EquipeService>(EQUIPE)
  const linhas = (await equipe.listRegistros(
    { alvo_id: alvo, acao: [...acoes] },
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

/**
 * Marketing: quem recebe ofertas por e-mail — os novos da semana e o total.
 * A mesma conta da aba Newsletter de Clientes (`newsletterDa`): o rodapé e a
 * caixa da conta juntos, sem repetir o e-mail.
 */
export async function numerosDaNewsletter(
  container: MedusaContainer,
  agora = new Date()
): Promise<{ semana: number; total: number }> {
  const [clientes, inscricoes] = await Promise.all([
    lerClientes(container),
    inscricoesDaNewsletter(container),
  ])
  const { numeros } = newsletterDa(juntarPessoas(clientes, [], inscricoes), inscricoes, agora)
  return { semana: numeros.semana, total: numeros.total }
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

/* ── os clientes ──────────────────────────────────────────────────────────── */

const CAMPOS_DO_CLIENTE = [
  "id",
  "email",
  "first_name",
  "last_name",
  "phone",
  "has_account",
  "created_at",
  "metadata",
]

/**
 * O que a lista de clientes lê de cada pedido: só o que conta (quantos,
 * quanto, quando) e a cidade. A lista trabalha com os últimos 2000 pedidos —
 * a loja é pequena, e isso cobre com folga a vida de cada cliente.
 */
const CAMPOS_DO_PEDIDO_NA_LISTA = [
  "id",
  "created_at",
  "status",
  "email",
  "customer_id",
  "total",
  "credit_line_total",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.city",
  "shipping_address.province",
  "payment_collections.payments.captured_at",
]

/** Os clientes do Medusa (convidados e contas), os mais novos primeiro — até 5000. */
export async function lerClientes(
  container: MedusaContainer,
  filtros: Record<string, unknown> = {}
): Promise<ClienteCru[]> {
  const { data } = await query(container).graph({
    entity: "customer",
    fields: CAMPOS_DO_CLIENTE,
    filters: filtros,
    pagination: { take: 5000, order: { created_at: "DESC" } },
  })
  return data as unknown as ClienteCru[]
}

/** Os últimos 2000 pedidos, só com o que a lista de clientes soma. */
export async function pedidosDosClientes(container: MedusaContainer): Promise<PedidoDoCliente[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: CAMPOS_DO_PEDIDO_NA_LISTA,
    filters: { is_draft_order: false },
    pagination: { take: 2000, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoDoCliente[]
}

/** Os pedidos inteiros de uns clientes (a ficha): os da lista de pedidos, e o endereço com o documento. */
export async function pedidosDe(
  container: MedusaContainer,
  clientes: string[]
): Promise<PedidoDoCliente[]> {
  if (!clientes.length) return []
  const { data } = await query(container).graph({
    entity: "order",
    fields: [...CAMPOS_DO_DETALHE, "customer_id"],
    filters: { customer_id: clientes, is_draft_order: false },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoDoCliente[]
}

/** A newsletter inteira, os mais novos primeiro. */
export async function inscricoesDaNewsletter(
  container: MedusaContainer,
  filtros: Record<string, unknown> = {}
): Promise<InscricaoCrua[]> {
  const servico = container.resolve<NewsletterService>(NEWSLETTER)
  const inscricoes = await servico.listInscricoes(filtros, {
    order: { consentido_em: "DESC" },
    take: 10_000,
  })
  return inscricoes.map((i) => ({
    id: i.id,
    email: i.email,
    origem: i.origem,
    consentido_em: i.consentido_em,
  }))
}
