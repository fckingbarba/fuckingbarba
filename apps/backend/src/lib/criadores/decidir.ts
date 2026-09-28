import type { MedusaContainer } from "@medusajs/framework/types"
import { CRIADORES } from "../../modules/criadores"
import type CriadoresService from "../../modules/criadores/service"
import { decidirInscricaoDeCriadorWorkflow } from "../../workflows/criadores/decidir"

/**
 * APROVAR (a loja vai chamar pra fechar) OU RECUSAR uma inscrição de
 * criador. De qualquer situação pra qualquer outra: a aprovada que não
 * fechou vira recusada; a recusada por engano, aprovada. O site não muda —
 * a página `/criadores` não mostra ninguém.
 */

export type AcaoDaDecisao = "aprovar" | "recusar"

/** O id que o Medusa gera: `cria_` e um ULID. */
export const ehIdDeInscricao = (id: unknown): id is string =>
  typeof id === "string" && /^cria_[0-9A-Z]{10,40}$/.test(id)

type Situacao = "nova" | "aprovada" | "recusada"
type Lida = {
  id: string
  modelo: string
  situacao: Situacao
  decidida_em: Date | string | null
  decidida_por: string | null
}

async function lerInscricao(container: MedusaContainer, id: string): Promise<Lida | null> {
  if (!ehIdDeInscricao(id)) return null
  const [i] = await container
    .resolve<CriadoresService>(CRIADORES)
    .listInscricoes({ id }, { take: 1 })
  return (i as unknown as Lida | undefined) ?? null
}

export type Decisao =
  | { ok: true; mudou: boolean; situacao: "aprovada" | "recusada"; modelo: string }
  | { ok: false; motivo: "nao_encontrada" }

export async function decidirInscricao(
  container: MedusaContainer,
  id: string,
  acao: AcaoDaDecisao,
  quem: string | null
): Promise<Decisao> {
  const i = await lerInscricao(container, id)
  if (!i) return { ok: false, motivo: "nao_encontrada" }
  const situacao = acao === "aprovar" ? "aprovada" : "recusada"
  if (i.situacao === situacao) return { ok: true, mudou: false, situacao, modelo: i.modelo }

  await decidirInscricaoDeCriadorWorkflow(container).run({
    input: {
      id,
      situacao,
      quem,
      antes: {
        situacao: i.situacao,
        decidida_em: i.decidida_em ? new Date(i.decidida_em) : null,
        decidida_por: i.decidida_por ?? null,
      },
    },
  })
  return { ok: true, mudou: true, situacao, modelo: i.modelo }
}

export type Apagamento =
  { ok: true; modelo: string } | { ok: false; motivo: "nao_encontrada" | "nao_recusada" }

/**
 * APAGAR DE VEZ — quando a pessoa pede (LGPD) ou a loja não vai chamar mesmo.
 * Só a RECUSADA: primeiro recusa, depois apaga — dois passos, como nas
 * avaliações, pra inscrição boa não sumir num clique errado. Não tem volta.
 */
export async function apagarInscricao(container: MedusaContainer, id: string): Promise<Apagamento> {
  const i = await lerInscricao(container, id)
  if (!i) return { ok: false, motivo: "nao_encontrada" }
  if (i.situacao !== "recusada") return { ok: false, motivo: "nao_recusada" }
  await container.resolve<CriadoresService>(CRIADORES).deleteInscricoes(id)
  return { ok: true, modelo: i.modelo }
}
