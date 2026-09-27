import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import {
  emLinha,
  listaDasAvaliacoes,
  type AvaliacaoCrua,
  type Filtro,
  type TelaDasAvaliacoes,
} from "./avaliacoes"
import { paginar, type Paginacao } from "./paginas"

/**
 * A LEITURA DA TELA DAS AVALIAÇÕES — o banco; a conta é `avaliacoes.ts`.
 *
 * A lista inteira vem numa leitura só (uma loja recebe dezenas por mês, não
 * milhares); o catálogo e os nomes da equipe, só da página que viaja.
 */

/** Mais que isso é outra tela (busca, meses) — por enquanto, as mais recentes. */
const LIMITE = 5000

export async function lerTelaDasAvaliacoes(
  container: MedusaContainer,
  {
    filtro,
    pagina,
    verPedido,
    agora = new Date(),
  }: { filtro: Filtro; pagina: number; verPedido: boolean; agora?: Date }
): Promise<TelaDasAvaliacoes & { paginacao: Paginacao }> {
  const cruas = (await container
    .resolve<AvaliacoesService>(AVALIACOES)
    .listAvaliacoes(
      {},
      { order: { created_at: "DESC" }, take: LIMITE }
    )) as unknown as AvaliacaoCrua[]
  const { lista, contagem, noSite } = listaDasAvaliacoes(cruas, filtro)
  const { itens, paginacao } = paginar(lista, pagina)

  const produtoIds = [...new Set(itens.map((a) => a.produto_id))]
  const { data } = produtoIds.length
    ? await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product",
        fields: ["id", "handle", "thumbnail"],
        filters: { id: produtoIds },
      })
    : { data: [] }
  const produtos = new Map(
    (data as { id: string; handle?: string | null; thumbnail?: string | null }[]).map((p) => [
      p.id,
      { handle: p.handle ?? null, foto: p.thumbnail ?? null },
    ])
  )
  const membroIds = [...new Set(itens.flatMap((a) => (a.moderada_por ? [a.moderada_por] : [])))]
  const nomes = new Map(
    membroIds.length
      ? (
          (await container
            .resolve<EquipeService>(EQUIPE)
            .listMembros({ id: membroIds }, { take: membroIds.length })) as {
            id: string
            nome: string
          }[]
        ).map((m) => [m.id, m.nome])
      : []
  )

  return {
    filtro,
    contagem,
    noSite,
    avaliacoes: itens.map((a) =>
      emLinha(a, {
        produto: produtos.get(a.produto_id) ?? null,
        quem: a.moderada_por ? (nomes.get(a.moderada_por) ?? null) : null,
        verPedido,
        agora,
      })
    ),
    paginacao,
  }
}

/** Quantas esperam o painel — o item da fila do Início. */
export async function quantasAvaliacoesNovas(container: MedusaContainer): Promise<number> {
  const [, total] = await container
    .resolve<AvaliacoesService>(AVALIACOES)
    .listAndCountAvaliacoes({ situacao: "nova" }, { select: ["id"], take: 1 })
  return total
}
