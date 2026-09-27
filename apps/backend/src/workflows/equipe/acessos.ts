import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { Ajuste } from "../../lib/equipe/regras"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registrarNaEquipeStep } from "./registrar"

/**
 * O DONO MUDANDO OS ACESSOS — a tabela "O que cada papel abre", salva.
 *
 * Quem decide SE pode (só o dono; a coluna do dono e as linhas fixas não
 * mudam; o que mora dentro de uma área, só com ela) é a rota, com
 * `lerAcessos` (`lib/equipe/regras.ts`), dentro da trava da equipe — isto só
 * escreve. O banco fica com as diferenças do padrão (`ajustesDa`), e o
 * registro ganha uma linha com o que mudou. Vale no próximo clique de cada
 * pessoa: o `membroAtivo` relê a tabela a cada pedido.
 *
 * Mexe só nas linhas que mudam — cria, troca e apaga uma a uma —, e não
 * apaga tudo pra escrever de novo: nesse meio-tempo a tabela vazia seria a
 * do padrão, e um pedido que caísse ali abriria o que o dono tinha fechado.
 */

type Entrada = {
  quemId: string
  /** As diferenças do padrão, depois de salvar — o que a tabela `equipe_acesso` guarda. */
  ajustes: Ajuste[]
  /** O que mudou de antes pra agora, pro registro. */
  mudou: Ajuste[]
}

type Linha = { id: string; papel: Ajuste["papel"]; area: string; abre: boolean }

const chave = (a: { papel: string; area: string }) => `${a.papel}/${a.area}`

const gravarAcessosStep = createStep(
  "gravar-acessos",
  async ({ ajustes }: Entrada, { container }) => {
    const equipe = container.resolve<EquipeService>(EQUIPE)
    const antes = (await equipe.listAcessos(
      {},
      { select: ["id", "papel", "area", "abre"], take: 500 }
    )) as Linha[]
    const querido = new Map(ajustes.map((a) => [chave(a), a]))
    const achado = new Map(antes.map((a) => [chave(a), a]))

    const trocar = antes.filter(
      (a) => querido.has(chave(a)) && querido.get(chave(a))!.abre !== a.abre
    )
    const apagar = antes.filter((a) => !querido.has(chave(a)))
    const criar = ajustes.filter((a) => !achado.has(chave(a)))

    if (trocar.length) await equipe.updateAcessos(trocar.map((a) => ({ id: a.id, abre: !a.abre })))
    const criados = criar.length ? await equipe.createAcessos(criar) : []
    if (apagar.length) await equipe.deleteAcessos(apagar.map((a) => a.id))

    return new StepResponse(ajustes.length, {
      trocados: trocar.map((a) => ({ id: a.id, abre: a.abre })),
      criados: criados.map((a) => a.id),
      apagados: apagar.map(({ papel, area, abre }) => ({ papel, area, abre })),
    })
  },
  async (desfazer, { container }) => {
    if (!desfazer) return
    const equipe = container.resolve<EquipeService>(EQUIPE)
    if (desfazer.criados.length) await equipe.deleteAcessos(desfazer.criados)
    if (desfazer.trocados.length) await equipe.updateAcessos(desfazer.trocados)
    if (desfazer.apagados.length) await equipe.createAcessos(desfazer.apagados)
  }
)

export const mudarAcessosWorkflow = createWorkflow("mudar-acessos", (entrada: Entrada) => {
  const linhas = gravarAcessosStep(entrada)
  registrarNaEquipeStep(
    transform({ entrada }, ({ entrada }) => ({
      membro_id: entrada.quemId,
      acao: "mudou_acessos",
      alvo_id: null,
      detalhe: { mudou: entrada.mudou },
    }))
  )
  return new WorkflowResponse(linhas)
})
