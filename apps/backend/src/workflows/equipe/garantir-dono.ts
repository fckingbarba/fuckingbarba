import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * O PRIMEIRO DONO — o e-mail do `DASHBOARD_DONO_EMAIL`, no Railway.
 *
 * O painel não tem tela de cadastro: a equipe nasce vazia, e o primeiro a
 * entrar é quem o Railway diz que é o dono. A rota do código
 * (`api/dashboard/entrar/codigo`) chama isto só quando a equipe está SEM
 * NENHUM DONO ATIVO e esse e-mail pede código — então roda no primeiro
 * acesso e, depois, nunca mais (a não ser que um dia falte dono, e aí é a
 * porta de emergência).
 *
 * Quem ainda não existe entra como dono convidado, e vira ativo ao
 * confirmar o código, como qualquer convidado. Quem já existia (convite
 * vencido, removido, outro papel) volta como dono, com o prazo renovado.
 */

type Entrada = { email: string; nome: string }

type Desfazer =
  { tipo: "criou"; id: string } | { tipo: "atualizou"; id: string; antes: Record<string, unknown> }

const gravarDonoStep = createStep(
  "gravar-dono",
  async ({ email, nome }: Entrada, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const [existente] = await equipe.listMembros({ email })
    const agora = new Date()

    if (!existente) {
      const membro = await equipe.createMembros({
        email,
        nome,
        papel: "dono",
        situacao: "convidado",
        convidado_em: agora,
        convidado_por: null,
      })
      return new StepResponse(membro, { tipo: "criou", id: membro.id } as Desfazer)
    }

    const antes = {
      papel: existente.papel,
      situacao: existente.situacao,
      convidado_em: existente.convidado_em,
    }
    const membro = await equipe.updateMembros({
      id: existente.id,
      papel: "dono",
      ...(existente.situacao === "ativo" ? {} : { situacao: "convidado", convidado_em: agora }),
    })
    return new StepResponse(membro, { tipo: "atualizou", id: existente.id, antes } as Desfazer)
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    const equipe = container.resolve<EquipeService>(EQUIPE)
    if (desfazer.tipo === "criou") await equipe.deleteMembros(desfazer.id)
    else await equipe.updateMembros({ id: desfazer.id, ...desfazer.antes })
  }
)

export const garantirDonoWorkflow = createWorkflow("garantir-dono", (entrada: Entrada) => {
  const membro = gravarDonoStep(entrada)
  registrarNaEquipeStep(
    transform({ membro }, ({ membro }) => ({
      membro_id: null,
      acao: "dono_pelo_railway",
      alvo_id: membro.id,
    }))
  )
  return new WorkflowResponse(membro)
})
