import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { moderarAvaliacaoWorkflow } from "../../workflows/avaliacoes/moderar"
import { avisarALoja } from "../revalidar"

/**
 * APROVAR (vai pro site) OU RECUSAR (não vai, ou sai) uma avaliação. De
 * qualquer situação pra qualquer outra: a aprovada que alguém quer tirar do
 * site é recusada; a recusada por engano, aprovada.
 *
 * Quando o que o site mostra muda — entrou uma aprovada, ou saiu —, a loja
 * é avisada (`avaliacoes`, com o perfil "seconds": quem aprovou vai abrir o
 * produto pra conferir, e a página velha por mais uma visita pareceria que
 * não salvou).
 *
 * RECUSAR NÃO É ESCONDER NOTA BAIXA. Nota ruim de quem comprou é
 * depoimento de verdade, e o que o site mostra tem que ser o que os
 * clientes disseram (CDC, art. 37): a recusa é pro que não é avaliação —
 * ofensa, dado pessoal de alguém, propaganda, texto sem sentido. O painel
 * diz isso do lado do botão.
 */

export type AcaoDaModeracao = "aprovar" | "recusar"

export type Moderacao =
  | { ok: true; mudou: boolean; situacao: "aprovada" | "recusada"; produto: string; nota: number }
  | { ok: false; motivo: "nao_encontrada" }

export async function moderarAvaliacao(
  container: MedusaContainer,
  id: string,
  acao: AcaoDaModeracao,
  quem: string | null
): Promise<Moderacao> {
  const servico = container.resolve<AvaliacoesService>(AVALIACOES)
  const [a] = /^aval_[0-9A-Z]{10,40}$/.test(id)
    ? await servico.listAvaliacoes({ id }, { take: 1 })
    : []
  if (!a) return { ok: false, motivo: "nao_encontrada" }

  const situacao = acao === "aprovar" ? "aprovada" : "recusada"
  const resposta = { situacao, produto: a.produto_nome, nota: Number(a.nota) } as const
  if (a.situacao === situacao) return { ok: true, mudou: false, ...resposta }

  await moderarAvaliacaoWorkflow(container).run({
    input: {
      id,
      situacao,
      quem,
      antes: {
        situacao: a.situacao,
        moderada_em: a.moderada_em ? new Date(a.moderada_em as unknown as string) : null,
        moderada_por: a.moderada_por ?? null,
      },
    },
  })
  if (a.situacao === "aprovada" || situacao === "aprovada") {
    await avisarALoja(
      ["avaliacoes"],
      container.resolve(ContainerRegistrationKeys.LOGGER),
      "seconds"
    )
  }
  return { ok: true, mudou: true, ...resposta }
}

export type Apagamento =
  | { ok: true; produto: string; nota: number }
  | { ok: false; motivo: "nao_encontrada" | "nao_recusada" }

/**
 * APAGAR DE VEZ — o pedido de exclusão da LGPD (a Política de Privacidade
 * promete: "fica até você pedir pra apagar"). Só a RECUSADA: quem quer
 * tirar uma do site recusa antes, e o botão de apagar mora na fita das
 * recusadas — dois passos, pra avaliação boa não sumir num clique errado.
 * Não tem volta, e o site não muda (a recusada não está nele).
 */
export async function apagarAvaliacao(container: MedusaContainer, id: string): Promise<Apagamento> {
  const servico = container.resolve<AvaliacoesService>(AVALIACOES)
  const [a] = /^aval_[0-9A-Z]{10,40}$/.test(id)
    ? await servico.listAvaliacoes({ id }, { take: 1 })
    : []
  if (!a) return { ok: false, motivo: "nao_encontrada" }
  if (a.situacao !== "recusada") return { ok: false, motivo: "nao_recusada" }
  await servico.deleteAvaliacoes(id)
  return { ok: true, produto: a.produto_nome, nota: Number(a.nota) }
}
