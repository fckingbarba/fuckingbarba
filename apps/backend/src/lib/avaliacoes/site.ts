import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"

/**
 * AS AVALIAÇÕES DO SITE — as aprovadas no painel, no formato que a loja
 * desenha (`Avaliacao`, em `apps/loja/src/conteudo/depoimentos.ts`): o nome
 * que a pessoa escolheu, a nota, o texto e o produto pelo HANDLE.
 *
 * O handle é lido do catálogo agora, e não guardado: a avaliação é do
 * produto (`produto_id`), e o endereço dele pode mudar (com o 301 da regra
 * das URLs). Produto que saiu do site (rascunho, apagado) leva as
 * avaliações dele junto — voltam quando ele voltar.
 *
 * Nada do pedido sai daqui: nem o número, nem o id. "Compra verificada" é o
 * que a loja afirma, e ela pode: toda avaliação daqui veio de um pedido pago.
 */

export type AvaliacaoDoSite = {
  id: string
  nome: string
  nota: number
  texto: string
  /** O handle do produto. */
  produto: string
  /** Quando a pessoa mandou (ISO). */
  em: string
}

/** Um teto pra resposta: é a loja inteira, e o cache dela guarda. */
const TETO = 2000

export async function avaliacoesDoSite(container: MedusaContainer): Promise<AvaliacaoDoSite[]> {
  const aprovadas = await container.resolve<AvaliacoesService>(AVALIACOES).listAvaliacoes(
    { situacao: "aprovada" },
    {
      select: ["id", "produto_id", "nome", "nota", "texto", "created_at"],
      order: { created_at: "DESC" },
      take: TETO,
    }
  )
  if (!aprovadas.length) return []

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "handle", "status"],
    filters: { id: [...new Set(aprovadas.map((a) => a.produto_id))] },
  })
  const handles = new Map(
    (data as { id: string; handle?: string | null; status?: string | null }[]).flatMap((p) =>
      p.handle && p.status === "published" ? [[p.id, p.handle] as const] : []
    )
  )

  return aprovadas.flatMap((a) => {
    const produto = handles.get(a.produto_id)
    if (!produto) return []
    return [
      {
        id: a.id,
        nome: a.nome,
        nota: Number(a.nota),
        texto: a.texto,
        produto,
        em: new Date(a.created_at as unknown as string).toISOString(),
      },
    ]
  })
}
