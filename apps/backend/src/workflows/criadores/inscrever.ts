import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { InscricaoLida } from "../../lib/criadores/regras"
import { CRIADORES } from "../../modules/criadores"
import type CriadoresService from "../../modules/criadores/service"

/**
 * Guarda a inscrição de um criador — ou atualiza a que já existe com o mesmo
 * e-mail (uma por pessoa: quem manda de novo está corrigindo, ou mudou de
 * ideia sobre o modelo).
 *
 * Quem chama é `POST /store/criadores`, com os campos conferidos
 * (`lerInscricao`). A nova entra como `nova`. A que já existia fica com a
 * situação que tinha — a aprovada continua aprovada —, menos a RECUSADA, que
 * volta pra fila: quem foi recusado e se inscreve de novo merece outra
 * olhada. A data do "sim" vira a de agora (a autorização foi marcada de novo).
 */

type Situacao = "nova" | "aprovada" | "recusada"

/** A linha como estava antes de atualizar — pra desfazer, se o resto falhar. */
type Guardada = Omit<InscricaoLida, "email"> & {
  id: string
  situacao: Situacao
  consentido_em: Date
  decidida_em: Date | null
  decidida_por: string | null
}

/** Desfazer a criação é apagar; desfazer a atualização é voltar o que estava. */
type Desfazer = { criada: string } | { antes: Guardada }

type Resultado = { nova: boolean }

const guardar = (l: Guardada): Guardada => ({
  id: l.id,
  nome: l.nome,
  whatsapp: l.whatsapp,
  cidade: l.cidade,
  instagram: l.instagram,
  tiktok: l.tiktok,
  seguidores: l.seguidores,
  barba: l.barba,
  experiencia: l.experiencia,
  video: l.video,
  parceria: l.parceria,
  modelo: l.modelo,
  situacao: l.situacao,
  consentido_em: l.consentido_em,
  decidida_em: l.decidida_em,
  decidida_por: l.decidida_por,
})

const gravarInscricaoDeCriadorStep = createStep(
  "gravar-inscricao-de-criador",
  async (e: InscricaoLida, { container }) => {
    const criadores = container.resolve<CriadoresService>(CRIADORES)
    const agora = new Date()

    /** Atualiza com o que chegou e devolve como estava, pra desfazer. */
    const atualizar = async (existente: Guardada): Promise<Guardada> => {
      const antes = guardar(existente)
      await criadores.updateInscricoes({
        ...e,
        id: existente.id,
        consentido_em: agora,
        ...(existente.situacao === "recusada"
          ? { situacao: "nova" as const, decidida_em: null, decidida_por: null }
          : {}),
      })
      return antes
    }

    const [existente] = await criadores.listInscricoes({ email: e.email }, { take: 1 })
    if (existente) {
      const antes = await atualizar(existente as unknown as Guardada)
      return new StepResponse<Resultado, Desfazer>({ nova: false }, { antes })
    }

    try {
      const criada = await criadores.createInscricoes({ ...e, consentido_em: agora })
      return new StepResponse<Resultado, Desfazer>({ nova: true }, { criada: criada.id })
    } catch (erro) {
      // Dois envios juntos do mesmo e-mail (o duplo clique): o segundo esbarra
      // no índice único e vira a atualização da que acabou de entrar.
      const [agoraExiste] = await criadores.listInscricoes({ email: e.email }, { take: 1 })
      if (!agoraExiste) throw erro
      const antes = await atualizar(agoraExiste as unknown as Guardada)
      return new StepResponse<Resultado, Desfazer>({ nova: false }, { antes })
    }
  },
  async (desfazer: Desfazer | undefined, { container }) => {
    if (!desfazer) return
    const criadores = container.resolve<CriadoresService>(CRIADORES)
    if ("criada" in desfazer) await criadores.deleteInscricoes(desfazer.criada)
    else await criadores.updateInscricoes(desfazer.antes)
  }
)

export const inscreverCriadorWorkflow = createWorkflow(
  "inscrever-criador",
  (entrada: InscricaoLida) => new WorkflowResponse(gravarInscricaoDeCriadorStep(entrada))
)
