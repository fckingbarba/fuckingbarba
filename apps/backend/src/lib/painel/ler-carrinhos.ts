import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import {
  contarOsCarrinhos,
  DIAS,
  linhasDosCarrinhos,
  type CarrinhoCru,
  type Chamado,
  type Filtro,
  type PedidoDaPessoa,
  type ResumoDoCarrinho,
  type TelaDosCarrinhos,
} from "./carrinhos"
import { paginar, type Paginacao } from "./paginas"

/**
 * O QUE A TELA DOS CARRINHOS LÊ: os carrinhos que não viraram pedido nos
 * últimos 30 dias, os pedidos das mesmas pessoas (pra saber quem voltou) e
 * quem da equipe já chamou cada um no WhatsApp. A regra é `carrinhos.ts`.
 * A página (de 30 em 30) sai daqui: só os dela são lidos inteiros.
 */

/** O registro da equipe: "chamou no WhatsApp" (o botão da lista). */
export const CHAMOU_NO_WHATSAPP = "chamou-no-whatsapp"

/**
 * Os mais recentes primeiro; mais que isso num mês é outra conversa (e outra
 * tela). Os sem e-mail vêm numa leitura à parte: são a maioria (quem pôs na
 * sacola e nem abriu o checkout) e, na mesma leitura, empurrariam pra fora
 * do limite justamente os que dá pra chamar. Com a leitura leve (0249), os
 * tetos subiram de 1.000 e 2.000: acima deles, os números de cima saíam
 * cortados ("sem contato: 2.000").
 */
const LIMITE = 5000
const LIMITE_SEM_EMAIL = 20000
const LIMITE_PEDIDOS = 5000

/** O carrinho inteiro — só dos 30 da página. */
const CAMPOS = [
  "id",
  "email",
  "updated_at",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.phone",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.phone",
  "shipping_address.postal_code",
  "shipping_address.address_1",
  "shipping_address.metadata",
  "billing_address.metadata",
  "items.title",
  "items.product_title",
  "items.product_id",
  "items.thumbnail",
  "items.quantity",
  "items.unit_price",
  "shipping_methods.id",
  "payment_collection.payment_sessions.status",
]

type Banco = {
  raw: (sql: string, bindings: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

/**
 * ┌─ OS RESUMOS DO MÊS, NUMA IDA SÓ AO BANCO (0249) ───────────────────────┐
 * │ A conta da lista (uma linha por pessoa, as fitas, os números) precisa  │
 * │ de todos os carrinhos do mês — mas só de quem é, quando e quanto. Pelo │
 * │ `query.graph`, eram os carrinhos INTEIROS (itens, endereços, frete,    │
 * │ pagamento), uns 3 mil, pra mostrar 30: medido com 3.500 no banco      │
 * │ local, ~350 ms; esta consulta, ~8 ms. O carrinho inteiro só se lê pros │
 * │ 30 da página. Só leitura, nas tabelas do Medusa (como                  │
 * │ `lib/whatsapp/cliente.ts`): o mesmo que o `query.graph` filtrava —     │
 * │ fora os apagados, os fechados e os itens apagados.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 */
const resumosDoBanco = (comEmail: boolean) => `
  select c.id, c.updated_at, c.email,
         cu.email as email_da_conta, cu.phone as telefone_da_conta,
         a.phone as telefone_do_endereco,
         count(i.id)::int as itens, coalesce(sum(i.quantity * i.unit_price), 0) as valor
    from cart c
    join cart_line_item i on i.cart_id = c.id and i.deleted_at is null
    left join customer cu on cu.id = c.customer_id and cu.deleted_at is null
    left join cart_address a on a.id = c.shipping_address_id and a.deleted_at is null
   where c.deleted_at is null and c.completed_at is null and c.updated_at >= ?
     and c.email is ${comEmail ? "not null" : "null"}
   group by c.id, cu.id, a.id
   order by c.updated_at desc
   limit ?`

const textoOuNulo = (v: unknown) => (typeof v === "string" ? v : null)

export async function lerTelaDosCarrinhos(
  container: MedusaContainer,
  {
    filtro,
    verContato,
    pagina = 1,
    agora = new Date(),
  }: { filtro: Filtro; verContato: boolean; pagina?: number; agora?: Date }
): Promise<TelaDosCarrinhos & { paginacao: Paginacao }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const banco = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Banco
  const desde = new Date(agora.getTime() - DIAS * 24 * 3600 * 1000)
  const resumos = (comEmail: boolean, limite: number) =>
    banco.raw(resumosDoBanco(comEmail), [desde, limite]).then(({ rows }) =>
      rows.map((l): ResumoDoCarrinho => ({
        id: String(l.id),
        updated_at: l.updated_at as Date,
        email: textoOuNulo(l.email),
        email_da_conta: textoOuNulo(l.email_da_conta),
        telefone_da_conta: textoOuNulo(l.telefone_da_conta),
        telefone_do_endereco: textoOuNulo(l.telefone_do_endereco),
        itens: Number(l.itens) || 0,
        valor: Number(l.valor) || 0,
      }))
    )
  // Os pedidos do mês inteiro, e não "os destes e-mails": o banco compara
  // o e-mail letra por letra, e a mesma pessoa escreve "Rafael@" num dia e
  // "rafael@" no outro. A comparação sem maiúsculas é a de `carrinhos.ts`.
  // Não dependem dos carrinhos: saem junto com eles.
  const pedidosDoMes = query
    .graph({
      entity: "order",
      fields: ["id", "display_id", "email", "created_at", "status"],
      filters: { created_at: { $gte: desde } },
      pagination: { take: LIMITE_PEDIDOS, order: { created_at: "DESC" } },
    })
    .then((r) => r.data as unknown as PedidoDaPessoa[])
  const [comEmail, semEmail, pedidos] = await Promise.all([
    resumos(true, LIMITE),
    resumos(false, LIMITE_SEM_EMAIL),
    pedidosDoMes,
  ])
  const { doFiltro, ...conta } = contarOsCarrinhos({
    resumos: [...comEmail, ...semEmail],
    pedidos,
    agora,
    filtro,
  })

  // Só os da página: o carrinho inteiro e quem já chamou no WhatsApp.
  const { itens: daPagina, paginacao } = paginar(doFiltro, pagina)
  const ids = daPagina.map((e) => e.id)
  const [inteiros, chamados] = await Promise.all([
    ids.length
      ? query
          .graph({ entity: "cart", fields: CAMPOS, filters: { id: ids } })
          .then((r) => r.data as unknown as CarrinhoCru[])
      : Promise.resolve([]),
    chamadosDos(container, ids),
  ])
  return {
    ...conta,
    verContato,
    carrinhos: linhasDosCarrinhos(daPagina, inteiros, { chamados, agora, verContato }),
    paginacao,
  }
}

/** O último "chamou no WhatsApp" de cada carrinho, com o nome de quem chamou. */
async function chamadosDos(
  container: MedusaContainer,
  ids: string[]
): Promise<Map<string, Chamado>> {
  if (!ids.length) return new Map()
  const equipe = container.resolve<EquipeService>(EQUIPE)
  const linhas = (await equipe.listRegistros(
    { alvo_id: ids, acao: CHAMOU_NO_WHATSAPP },
    { take: 2000, order: { created_at: "ASC" } }
  )) as unknown as { membro_id: string | null; alvo_id: string; created_at: Date }[]
  const membros = [...new Set(linhas.map((l) => l.membro_id).filter((id): id is string => !!id))]
  const nomes = new Map(
    (membros.length
      ? ((await equipe.listMembros({ id: membros }, { take: membros.length })) as {
          id: string
          nome: string
        }[])
      : []
    ).map((m) => [m.id, m.nome])
  )
  // Em ordem: o último de cada carrinho fica.
  return new Map(
    linhas.map((l) => [
      l.alvo_id,
      { quem: (l.membro_id && nomes.get(l.membro_id)) || "Alguém da equipe", em: l.created_at },
    ])
  )
}
