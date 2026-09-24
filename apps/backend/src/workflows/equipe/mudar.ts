import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { Mudanca } from "../../lib/equipe/regras"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * MUDAR ALGUÉM DA EQUIPE — o papel, remover, ou reenviar o convite.
 *
 * Quem decide SE pode (o último dono, o "a si mesmo") é `podeMudar`, em
 * `lib/equipe/regras.ts`, chamado pela rota antes — isto só escreve.
 * Remover não apaga: a situação vira `removido` e, no próximo clique, o
 * `membroAtivo` barra a pessoa, com o token que ela tiver.
 */

type Entrada = { quemId: string; id: string; mudanca: Mudanca }

const aplicarMudancaStep = createStep(
  "aplicar-mudanca",
  async ({ id, mudanca }: Entrada, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const antes = await equipe.retrieveMembros(id)
    const volta = {
      papel: antes.papel,
      situacao: antes.situacao,
      convidado_em: antes.convidado_em,
    }
    const membro = await equipe.updateMembros({
      id,
      ...(mudanca.tipo === "papel" ? { papel: mudanca.papel } : {}),
      ...(mudanca.tipo === "remover" ? { situacao: "removido" as const } : {}),
      ...(mudanca.tipo === "reenviar" ? { convidado_em: new Date() } : {}),
    })
    return new StepResponse(
      { membro, antes: { papel: antes.papel, situacao: antes.situacao } },
      { id, volta }
    )
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    await container
      .resolve<EquipeService>(EQUIPE)
      .updateMembros({ id: desfazer.id, ...desfazer.volta })
  }
)

export const mudarMembroWorkflow = createWorkflow("mudar-membro", (entrada: Entrada) => {
  const feito = aplicarMudancaStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada, feito }, ({ entrada, feito }) => ({
      membro_id: entrada.quemId,
      acao:
        entrada.mudanca.tipo === "papel"
          ? "mudou_papel"
          : entrada.mudanca.tipo === "remover"
            ? "removeu"
            : "reenviou_convite",
      alvo_id: entrada.id,
      detalhe:
        entrada.mudanca.tipo === "papel"
          ? { de: feito.antes.papel, para: entrada.mudanca.papel }
          : null,
    }))
  )
  return new WorkflowResponse(transform({ feito }, ({ feito }) => feito.membro))
})
