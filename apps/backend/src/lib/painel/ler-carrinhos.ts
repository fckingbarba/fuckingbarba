import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import {
  contatoDo,
  DIAS,
  telaDosCarrinhos,
  type CarrinhoCru,
  type Chamado,
  type Filtro,
  type PedidoDaPessoa,
  type TelaDosCarrinhos,
} from "./carrinhos"

/**
 * O QUE A TELA DOS CARRINHOS LÊ: os carrinhos que não viraram pedido nos
 * últimos 30 dias, os pedidos das mesmas pessoas (pra saber quem voltou) e
 * quem da equipe já chamou cada um no WhatsApp. A regra é `carrinhos.ts`.
 */

/** O registro da equipe: "chamou no WhatsApp" (o botão da lista). */
export const CHAMOU_NO_WHATSAPP = "chamou-no-whatsapp"

/**
 * Os mais recentes primeiro; mais que isso num mês é outra conversa (e outra
 * tela). Os sem e-mail vêm numa leitura à parte: são a maioria (quem pôs na
 * sacola e nem abriu o checkout) e, na mesma leitura, empurrariam pra fora
 * do limite justamente os que dá pra chamar.
 */
const LIMITE = 1000
const LIMITE_SEM_EMAIL = 2000
const LIMITE_PEDIDOS = 5000

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
  "items.quantity",
  "items.unit_price",
  "shipping_methods.id",
  "payment_collection.payment_sessions.status",
]

export async function lerTelaDosCarrinhos(
  container: MedusaContainer,
  { filtro, verContato, agora = new Date() }: { filtro: Filtro; verContato: boolean; agora?: Date }
): Promise<TelaDosCarrinhos> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const desde = new Date(agora.getTime() - DIAS * 24 * 3600 * 1000)
  const ler = (email: null | { $ne: null }, take: number) =>
    query
      .graph({
        entity: "cart",
        fields: CAMPOS,
        filters: { completed_at: null, updated_at: { $gte: desde }, email },
        pagination: { take, order: { updated_at: "DESC" } },
      })
      .then((r) => r.data as unknown as CarrinhoCru[])
  const [comEmail, semEmail] = await Promise.all([
    ler({ $ne: null }, LIMITE),
    ler(null, LIMITE_SEM_EMAIL),
  ])
  const lidos = [...comEmail, ...semEmail]

  const [pedidos, chamados] = await Promise.all([
    // Os pedidos do mês inteiro, e não "os destes e-mails": o banco compara
    // o e-mail letra por letra, e a mesma pessoa escreve "Rafael@" num dia e
    // "rafael@" no outro. A comparação sem maiúsculas é a de `carrinhos.ts`.
    query
      .graph({
        entity: "order",
        fields: ["id", "display_id", "email", "created_at", "status"],
        filters: { created_at: { $gte: desde } },
        pagination: { take: LIMITE_PEDIDOS, order: { created_at: "DESC" } },
      })
      .then((r) => r.data as unknown as PedidoDaPessoa[]),
    // Só os que viram linha (com e-mail ou telefone): os outros não têm quem chamar.
    chamadosDos(
      container,
      lidos
        .filter((c) => {
          const k = contatoDo(c)
          return Boolean(k.email || k.telefone)
        })
        .map((c) => c.id)
    ),
  ])
  return telaDosCarrinhos({ carrinhos: lidos, pedidos, chamados, agora, filtro, verContato })
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
