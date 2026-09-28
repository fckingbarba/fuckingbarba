import type { MedusaContainer } from "@medusajs/framework/types"
import { CRIADORES } from "../../modules/criadores"
import type CriadoresService from "../../modules/criadores/service"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import {
  emLinha,
  listaDasInscricoes,
  paginaDosCriadores,
  type Filtro,
  type InscricaoCrua,
  type TelaDosCriadores,
} from "./criadores"
import { paginar, type Paginacao } from "./paginas"

/**
 * A LEITURA DA TELA DOS CRIADORES — o banco; a conta é `criadores.ts`.
 *
 * A lista inteira vem numa leitura só (a página é escondida: chegam dezenas,
 * não milhares); os nomes da equipe, só da página que viaja.
 */

/** Mais que isso é outra tela (busca) — por enquanto, as mais recentes. */
const LIMITE = 5000

export async function lerTelaDosCriadores(
  container: MedusaContainer,
  { filtro, pagina, agora = new Date() }: { filtro: Filtro; pagina: number; agora?: Date }
): Promise<TelaDosCriadores & { paginacao: Paginacao }> {
  const cruas = (await container
    .resolve<CriadoresService>(CRIADORES)
    .listInscricoes(
      {},
      { order: { consentido_em: "DESC" }, take: LIMITE }
    )) as unknown as InscricaoCrua[]
  const { lista, contagem, modelos } = listaDasInscricoes(cruas, filtro)
  const { itens, paginacao } = paginar(lista, pagina)

  const membroIds = [...new Set(itens.flatMap((c) => (c.decidida_por ? [c.decidida_por] : [])))]
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
    modelos,
    pagina: paginaDosCriadores(process.env.LOJA_URL),
    inscricoes: itens.map((c) =>
      emLinha(c, { quem: c.decidida_por ? (nomes.get(c.decidida_por) ?? null) : null, agora })
    ),
    paginacao,
  }
}
