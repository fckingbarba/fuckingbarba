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
import type { CarrinhoDoCheckout, ProdutoComSku } from "./inicio-periodo"
import type { CarrinhoDoFunil } from "./marketing-funil"
import type { CarrinhoDoPagamento, PedidoDoPagamento } from "./marketing-pagamento"
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

/**
 * O que o VIGIA lê de cada pedido (`problemasDosPedidos`): o número, a
 * situação e o metadata — é no metadata que moram o estorno e o registro na
 * Frenet. Nada de total, itens, endereço ou pagamento: o vigia roda de 5 em 5
 * minutos, e o total (ver `CAMPOS_SEM_TOTAL`: o Medusa calcula, lendo itens,
 * impostos, ajustes e frete de cada pedido) é o que mais pesa numa leitura de
 * 500 pedidos. Medido na 0199: ~1,8 KB por pedido com os da lista, ~0,35 KB
 * com estes — e ~20 vezes mais rápido.
 */
export const CAMPOS_DO_VIGIA = ["id", "display_id", "created_at", "status", "metadata"] as const

/** O pedido inteiro: o da lista, e o que só o detalhe mostra. */
const CAMPOS_DO_DETALHE = [
  ...CAMPOS_DA_LISTA,
  // O endereço do produto: a ficha do cliente sabe quanto ele dura (`lib/crm/etiquetas.ts`).
  "items.product_handle",
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
 * Todos os pedidos da loja nova com o que as etiquetas do CRM usam (o SKU, o
 * pagamento, a entrega, os cupons) — as contas da aba da base da Nuvemshop.
 * Com `email`, só os feitos com ele (o aviso da reposição no site, 0188; o
 * checkout grava o e-mail em minúsculas).
 *
 * Os itens, só com o que `pedidoDaPessoa` usa (o endereço, o SKU, o nome e a
 * quantidade). A quantidade mora no `detail` no Medusa 2.21: o
 * `items.quantity` sozinho vem vazio (0116), e com o `items.detail.quantity`
 * vem certa. Até a 0199 era o `items.*` — que traz a descrição inteira do
 * produto em cada item, e o CRM lê todos os pedidos a cada 5 minutos.
 */
export async function pedidosParaAsEtiquetas(
  container: MedusaContainer,
  { email }: { email?: string } = {}
): Promise<PedidoCru[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "created_at",
      "canceled_at",
      "items.id",
      "items.title",
      "items.product_title",
      "items.product_handle",
      "items.variant_sku",
      "items.quantity",
      "items.detail.quantity",
      "items.adjustments.code",
      "payment_collections.payments.captured_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
    ],
    filters: { is_draft_order: false, ...(email ? { email } : {}) },
    pagination: { take: 5000, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoCru[]
}

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
  "items.product_handle",
  "items.adjustments.code",
  "items.adjustments.amount",
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
 * Os pedidos feitos desde `desde` só com o que diz se e quando foram pagos —
 * o Início conta as vendas no mesmo corte de hora das visitas do Google
 * (`visitas-do-periodo.ts`). Leve: sem o total e sem os itens.
 */
export async function pagosDesde(container: MedusaContainer, desde: Date): Promise<PedidoCru[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: ["id", "created_at", "status", "payment_collections.payments.captured_at"],
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

/**
 * Os carrinhos criados na janela, com o que o checkout do Início usa pra
 * saber até onde cada um foi (`ateOndeFoi`): a marca de quando o checkout
 * abriu, o e-mail e o documento (o contato), o endereço e o frete (a
 * entrega), se fechou e o pedido que virou. Nada disso sai da rota: a
 * resposta é só a contagem de cada passo.
 */
export async function carrinhosDoCheckout(
  container: MedusaContainer,
  janela: { de: Date; ate: Date }
): Promise<CarrinhoDoCheckout[]> {
  const { data } = await query(container).graph({
    entity: "cart",
    fields: [
      "id",
      "created_at",
      "email",
      "completed_at",
      "metadata",
      "items.id",
      "billing_address.metadata",
      "shipping_address.postal_code",
      "shipping_address.address_1",
      "shipping_address.metadata",
      "shipping_methods.id",
      "order.id",
    ],
    filters: { created_at: { $gte: janela.de, $lt: janela.ate } },
    pagination: { take: 20_000, order: { created_at: "DESC" } },
  })
  return data as unknown as CarrinhoDoCheckout[]
}

/**
 * Os pedidos com o que as abas Clientes e Pagamento e frete do Marketing
 * usam: o e-mail (a pessoa), o estado, o frete, os produtos e o estado do
 * Pagar.me em cada sessão (a forma, as parcelas, a recusa). `desde` nulo: a
 * história inteira (a primeira compra de cada pessoa pode ser antiga). Nada
 * disso sai da rota: a resposta é só conta.
 */
export async function pedidosComPagamento(
  container: MedusaContainer,
  desde: Date | null
): Promise<PedidoDoPagamento[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: [
      "id",
      "created_at",
      "status",
      "email",
      "total",
      "credit_line_total",
      "shipping_total",
      "item_subtotal",
      "shipping_address.province",
      "payment_collections.payments.captured_at",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.data",
    ],
    filters: { is_draft_order: false, ...(desde ? { created_at: { $gte: desde } } : {}) },
    pagination: { take: 20_000, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoDoPagamento[]
}

/** Os carrinhos do período com a sessão de pagamento — o cartão recusado não vira pedido. */
export async function carrinhosComPagamento(
  container: MedusaContainer,
  desde: Date
): Promise<CarrinhoDoPagamento[]> {
  const { data } = await query(container).graph({
    entity: "cart",
    fields: [
      "id",
      "created_at",
      "completed_at",
      "shipping_address.postal_code",
      "shipping_methods.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
      "payment_collection.payment_sessions.data",
    ],
    filters: { created_at: { $gte: desde } },
    pagination: { take: 20_000, order: { created_at: "DESC" } },
  })
  return data as unknown as CarrinhoDoPagamento[]
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

/**
 * A lista sem o total. O total do pedido o Medusa não guarda: ele CALCULA,
 * lendo os itens, os impostos, os ajustes, o frete e os créditos de cada
 * um — é o que mais pesa na leitura. A lista em páginas lê a janela inteira
 * sem ele (pra filtrar, buscar e contar) e pede o total só dos pedidos da
 * página (`totaisDos`).
 */
const CAMPOS_SEM_TOTAL = CAMPOS_DA_LISTA.filter((c) => c !== "total" && c !== "credit_line_total")

/**
 * Os pedidos mais novos primeiro: os `limite` últimos, ou os dos últimos `dias`.
 * `semTotal`: sem o `total` e o `credit_line_total` (ver `CAMPOS_SEM_TOTAL`).
 * `campos`: só estes, no lugar dos da lista (o vigia: `CAMPOS_DO_VIGIA`).
 */
export async function pedidosRecentes(
  container: MedusaContainer,
  {
    limite,
    dias,
    agora = new Date(),
    semTotal = false,
    campos,
  }: {
    limite: number
    dias?: number
    agora?: Date
    semTotal?: boolean
    campos?: readonly string[]
  }
): Promise<PedidoCru[]> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: campos ? [...campos] : semTotal ? CAMPOS_SEM_TOTAL : CAMPOS_DA_LISTA,
    filters: {
      is_draft_order: false,
      ...(dias ? { created_at: { $gte: new Date(agora.getTime() - dias * DIA_MS) } } : {}),
    },
    pagination: { take: limite, order: { created_at: "DESC" } },
  })
  return data as unknown as PedidoCru[]
}

/**
 * Os pedidos FEITOS na janela (os mais novos primeiro, até `limite`, com o
 * total) e quantos são ao todo — os "Pedidos do período" do Início.
 */
export async function pedidosFeitosEntre(
  container: MedusaContainer,
  janela: { de: Date; ate: Date },
  limite: number
): Promise<{ pedidos: PedidoCru[]; total: number }> {
  const { data, metadata } = await query(container).graph({
    entity: "order",
    fields: CAMPOS_DA_LISTA,
    filters: { is_draft_order: false, created_at: { $gte: janela.de, $lt: janela.ate } },
    // Com o `skip`: sem ele, o `query.graph` não devolve a contagem (o `metadata` vem vazio).
    pagination: { skip: 0, take: limite, order: { created_at: "DESC" } },
  })
  return { pedidos: data as unknown as PedidoCru[], total: Number(metadata?.count ?? data.length) }
}

/**
 * O total dos pedidos feitos desde `desde` (os da semana, no Início): lido JUNTO com a janela sem
 * o total, e não depois dela — o que ficar de fora (o raro pago agora de um pedido velho) o
 * `totaisDos` completa.
 */
export async function totaisDesde(
  container: MedusaContainer,
  desde: Date,
  limite = 500
): Promise<Map<string, Pick<PedidoCru, "total" | "credit_line_total">>> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: ["id", "total", "credit_line_total"],
    filters: { is_draft_order: false, created_at: { $gte: desde } },
    pagination: { take: limite, order: { created_at: "DESC" } },
  })
  const lidos = data as unknown as (Pick<PedidoCru, "total" | "credit_line_total"> & {
    id: string
  })[]
  return new Map(lidos.map((o) => [o.id, o]))
}

/** O total de uns poucos pedidos (os da página): `total` e `credit_line_total`, pro `totalDo`. */
export async function totaisDos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, Pick<PedidoCru, "total" | "credit_line_total">>> {
  if (!ids.length) return new Map()
  const { data } = await query(container).graph({
    entity: "order",
    fields: ["id", "total", "credit_line_total"],
    filters: { id: ids },
  })
  const lidos = data as unknown as (Pick<PedidoCru, "total" | "credit_line_total"> & {
    id: string
  })[]
  return new Map(lidos.map((o) => [o.id, o]))
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
 * Os produtos com o SKU de cada variação — um item vendido na Nuvemshop vira
 * o produto de hoje pelo SKU (os mais vendidos do Início).
 */
export async function produtosComSku(container: MedusaContainer): Promise<ProdutoComSku[]> {
  const { data } = await query(container).graph({
    entity: "product",
    fields: ["id", "title", "thumbnail", "variants.sku"],
    pagination: { take: 500 },
  })
  return (
    data as {
      id: string
      title?: string | null
      thumbnail?: string | null
      variants?: ({ sku?: string | null } | null)[] | null
    }[]
  ).map((p) => ({
    id: p.id,
    titulo: p.title ?? "Produto",
    imagem: p.thumbnail ?? null,
    skus: (p.variants ?? []).map((v) => v?.sku),
  }))
}

/** O endereço de cada categoria ("barba" → a página /barba): as páginas de categoria das visitas. */
export async function enderecosDasCategorias(container: MedusaContainer): Promise<string[]> {
  const { data } = await query(container).graph({
    entity: "product_category",
    fields: ["handle"],
    pagination: { take: 100 },
  })
  return (data as { handle?: string | null }[]).flatMap((c) => (c.handle ? [c.handle] : []))
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
    // Com o `skip` (0186): sem ele, o `query.graph` não devolve a contagem, e o item do marketing
    // ("Produtos em rascunho") nunca aparecia.
    pagination: { skip: 0, take: 1 },
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

/**
 * TODOS os clientes, em páginas de 5000 — o público das campanhas do CRM
 * (entrega 0206) não pode parar nos 5000 mais novos, como a lista da tela.
 */
export async function lerTodosOsClientes(container: MedusaContainer): Promise<ClienteCru[]> {
  const todos: ClienteCru[] = []
  for (let skip = 0; ; skip += 5000) {
    const { data } = await query(container).graph({
      entity: "customer",
      fields: CAMPOS_DO_CLIENTE,
      pagination: { skip, take: 5000, order: { created_at: "DESC" } },
    })
    todos.push(...(data as unknown as ClienteCru[]))
    if (data.length < 5000) return todos
  }
}

/**
 * TODOS os pedidos, em páginas de 2000, só com o que a lista de clientes
 * soma. Antes eram os últimos 2000; desde que cliente é quem pagou (0242),
 * quem comprou antes deles sumiria da lista.
 */
export async function pedidosDosClientes(
  container: MedusaContainer,
  { semTotal = false }: { semTotal?: boolean } = {}
): Promise<PedidoDoCliente[]> {
  const todos: PedidoDoCliente[] = []
  for (let skip = 0; ; skip += 2000) {
    const { data } = await query(container).graph({
      entity: "order",
      // Sem o total, a lista de clientes pede o de cada pedido vendido de quem
      // está na página (`vendidosDaPagina`, em `clientes.ts`) — ver `CAMPOS_SEM_TOTAL`.
      fields: semTotal
        ? CAMPOS_DO_PEDIDO_NA_LISTA.filter((c) => c !== "total" && c !== "credit_line_total")
        : CAMPOS_DO_PEDIDO_NA_LISTA,
      filters: { is_draft_order: false },
      pagination: { skip, take: 2000, order: { created_at: "DESC" } },
    })
    todos.push(...(data as unknown as PedidoDoCliente[]))
    if (data.length < 2000) return todos
  }
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
