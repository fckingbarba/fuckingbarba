import { MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { Papel } from "../../lib/equipe/regras"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * CONVIDAR ALGUÉM PRO PAINEL — ou trazer de volta quem tinha sido removido.
 *
 * O convite só cria a linha do membro (`convidado`, com a data): quem entra
 * de verdade é a própria pessoa, pedindo o código no e-mail dentro de 7
 * dias. Quem manda o e-mail do convite é a rota, depois deste workflow — o
 * e-mail que não sai não desfaz o convite, e o dono pode reenviar.
 *
 * O primeiro dono não passa por aqui: ele vem do `DASHBOARD_DONO_EMAIL` do
 * Railway, por `garantir-dono.ts`.
 */

type Entrada = { quemId: string; nome: string; email: string; papel: Papel }

type Desfazer =
  { tipo: "criou"; id: string } | { tipo: "reativou"; id: string; antes: Record<string, unknown> }

const gravarConviteStep = createStep(
  "gravar-convite",
  async ({ quemId, nome, email, papel }: Entrada, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const [existente] = await equipe.listMembros({ email })
    const agora = new Date()

    if (existente) {
      if (existente.situacao !== "removido")
        throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "ja_na_equipe")
      const antes = {
        nome: existente.nome,
        papel: existente.papel,
        situacao: existente.situacao,
        convidado_em: existente.convidado_em,
        convidado_por: existente.convidado_por,
      }
      const membro = await equipe.updateMembros({
        id: existente.id,
        nome,
        papel,
        situacao: "convidado",
        convidado_em: agora,
        convidado_por: quemId,
      })
      return new StepResponse(membro, { tipo: "reativou", id: existente.id, antes } as Desfazer)
    }

    const membro = await equipe.createMembros({
      email,
      nome,
      papel,
      situacao: "convidado",
      convidado_em: agora,
      convidado_por: quemId,
    })
    return new StepResponse(membro, { tipo: "criou", id: membro.id } as Desfazer)
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    const equipe = container.resolve<EquipeService>(EQUIPE)
    if (desfazer.tipo === "criou") await equipe.deleteMembros(desfazer.id)
    else await equipe.updateMembros({ id: desfazer.id, ...desfazer.antes })
  }
)

export const convidarMembroWorkflow = createWorkflow("convidar-membro", (entrada: Entrada) => {
  const membro = gravarConviteStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada, membro }, ({ entrada, membro }) => ({
      membro_id: entrada.quemId,
      acao: "convidou",
      alvo_id: membro.id,
      detalhe: { papel: entrada.papel },
    }))
  )
  return new WorkflowResponse(membro)
})
