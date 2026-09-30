import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { Area, PapelAjustavel } from "../../lib/equipe/regras"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * OS PAPÉIS QUE O DONO CRIA — criar, renomear e apagar, na tela "Equipe e
 * acessos".
 *
 * Quem decide SE pode (só o dono; nome de 2 a 30 letras, sem repetir; no
 * máximo 10; apagar só papel sem ninguém) é a rota, com as regras de
 * `lib/equipe/regras.ts`, dentro da trava da equipe — isto só escreve, e
 * cada um deixa a sua linha no registro. O que o papel abre mora na
 * `equipe_acesso`, como os ajustes da operação e do marketing: criar grava
 * as áreas de começo (as de `igualA`, se o dono escolheu), e apagar leva as
 * linhas dele junto.
 */

type Criar = { quemId: string; nome: string; igualA: PapelAjustavel | null; areas: Area[] }

const criarPapelStep = createStep(
  "criar-papel",
  async ({ nome }: Criar, { container }) => {
    const papel = await container.resolve<EquipeService>(EQUIPE).createPapeisCriados({ nome })
    return new StepResponse(papel, papel.id)
  },
  async (id, { container }) => {
    if (!id) return
    await container.resolve<EquipeService>(EQUIPE).deletePapeisCriados(id)
  }
)

const gravarAreasDoPapelStep = createStep(
  "gravar-areas-do-papel",
  async ({ papel, areas }: { papel: string; areas: Area[] }, { container }) => {
    if (!areas.length) return new StepResponse([] as string[], [] as string[])
    const linhas = await container
      .resolve<EquipeService>(EQUIPE)
      .createAcessos(areas.map((area) => ({ papel, area, abre: true })))
    const ids = linhas.map((l) => l.id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) return
    await container.resolve<EquipeService>(EQUIPE).deleteAcessos(ids)
  }
)

export const criarPapelWorkflow = createWorkflow("criar-papel", (entrada: Criar) => {
  const papel = criarPapelStep(entrada)
  gravarAreasDoPapelStep(
    transform({ entrada, papel }, ({ entrada, papel }) => ({
      papel: papel.id,
      areas: entrada.areas,
    }))
  )
  registrarNaEquipeStep(
    transform({ entrada, papel }, ({ entrada, papel }) => ({
      membro_id: entrada.quemId,
      acao: "criou_papel",
      alvo_id: papel.id,
      detalhe: { nome: entrada.nome, igual_a: entrada.igualA, areas: entrada.areas },
    }))
  )
  return new WorkflowResponse(papel)
})

type Renomear = { quemId: string; id: string; nome: string }

const renomearPapelStep = createStep(
  "renomear-papel",
  async ({ id, nome }: Renomear, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const antes = await equipe.retrievePapeisCriados(id)
    const papel = await equipe.updatePapeisCriados({ id, nome })
    return new StepResponse({ papel, de: antes.nome }, { id, nome: antes.nome })
  },
  async (volta, { container }) => {
    if (!volta) return
    await container.resolve<EquipeService>(EQUIPE).updatePapeisCriados(volta)
  }
)

export const renomearPapelWorkflow = createWorkflow("renomear-papel", (entrada: Renomear) => {
  const feito = renomearPapelStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada, feito }, ({ entrada, feito }) => ({
      membro_id: entrada.quemId,
      acao: "renomeou_papel",
      alvo_id: entrada.id,
      detalhe: { de: feito.de, para: entrada.nome },
    }))
  )
  return new WorkflowResponse(transform({ feito }, ({ feito }) => feito.papel))
})

type Apagar = { quemId: string; id: string }

type LinhaDoAcesso = { papel: string; area: string; abre: boolean }

/**
 * Tira as linhas do papel da `equipe_acesso` e apaga o papel (`softDelete`:
 * o registro segue achando o nome). As linhas saem antes: um papel apagado
 * com linhas sobrando não abriria nada (`matrizCom` só lê os papéis que
 * existem), mas elas ficariam lá à toa.
 */
const apagarPapelStep = createStep(
  "apagar-papel",
  async ({ id }: Apagar, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const papel = await equipe.retrievePapeisCriados(id)
    const linhas = await equipe.listAcessos(
      { papel: id },
      { select: ["id", "papel", "area", "abre"], take: 1000 }
    )
    if (linhas.length) await equipe.deleteAcessos(linhas.map((l) => l.id))
    await equipe.softDeletePapeisCriados([id])
    return new StepResponse(
      { nome: papel.nome },
      {
        id,
        linhas: linhas.map(({ papel, area, abre }) => ({ papel, area, abre })) as LinhaDoAcesso[],
      }
    )
  },
  async (volta, { container }) => {
    if (!volta) return
    const equipe = container.resolve<EquipeService>(EQUIPE)
    await equipe.restorePapeisCriados([volta.id])
    if (volta.linhas.length) await equipe.createAcessos(volta.linhas)
  }
)

export const apagarPapelWorkflow = createWorkflow("apagar-papel", (entrada: Apagar) => {
  const feito = apagarPapelStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada, feito }, ({ entrada, feito }) => ({
      membro_id: entrada.quemId,
      acao: "apagou_papel",
      alvo_id: entrada.id,
      detalhe: { nome: feito.nome },
    }))
  )
  return new WorkflowResponse(feito)
})
