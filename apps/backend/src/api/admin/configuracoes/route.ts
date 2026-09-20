import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import {
  CHAVE_NO_METADATA,
  lerConfiguracoes,
  PADRAO,
  type Configuracoes,
} from "../../../lib/configuracoes"
import { avisarALoja } from "../../../lib/revalidar"

/**
 * GET/POST /admin/configuracoes — a tela de configurações do admin fala aqui.
 *
 * O GET devolve o mesmo objeto que a rota pública, pra que o formulário do
 * admin mostre exatamente o que a loja está exibindo — e não uma leitura
 * paralela que pode discordar.
 *
 * O POST GRAVA O QUE PASSOU PELA MESMA PENEIRA da leitura pública. Isso é de
 * propósito: se o formulário mandar um piso escrito como "149,90", ele vira
 * 149.9 aqui e não "149,90" no banco pra quebrar a conta três telas adiante.
 * Validar na entrada e na saída parece redundante até o dia em que alguém
 * edita o metadata por fora do formulário.
 *
 * Depois de gravar, avisa a loja pra derrubar o cache. Sem isso, o número
 * novo só apareceria quando a etiqueta vencesse — horas em que a vitrine
 * anuncia um frete e o carrinho cobra outro.
 */

const TAG = "configuracoes"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(Modules.STORE)
  const [loja] = await service.listStores({}, { select: ["id", "metadata"], take: 1 })
  res.json({ configuracoes: lerConfiguracoes(loja?.metadata) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const service = req.scope.resolve(Modules.STORE)

  const [loja] = await service.listStores({}, { select: ["id", "metadata"], take: 1 })
  if (!loja) {
    res.status(404).json({ erro: "nenhuma loja configurada no Medusa" })
    return
  }

  /*
    A peneira roda sobre o corpo embrulhado na mesma forma que o metadata
    tem, pra reaproveitar `lerConfiguracoes` inteiro em vez de escrever uma
    segunda validação que pode divergir da primeira.
  */
  const limpas: Configuracoes = lerConfiguracoes({ [CHAVE_NO_METADATA]: req.body })

  /*
    Pelo WORKFLOW, e não chamando o serviço direto: workflow do Medusa tem
    passo compensável, então uma falha no meio desfaz o que já foi feito em
    vez de deixar a loja com metade da configuração nova. É também o que a
    regra de lint do próprio Medusa cobra — e ela cobra por esse motivo.
  */
  await updateStoresWorkflow(req.scope).run({
    input: {
      selector: { id: loja.id },
      update: {
        // Espalha o metadata existente: gravar só a nossa chave APAGARIA o
        // que qualquer outra parte do Medusa tenha guardado aí.
        metadata: { ...(loja.metadata ?? {}), [CHAVE_NO_METADATA]: limpas },
      },
    },
  })

  const aviso = await avisarALoja([TAG], logger, "seconds")
  logger.info(`[configuracoes] salvas (frete: ${limpas.frete.modo})`)

  res.json({ configuracoes: limpas, loja_avisada: aviso.avisou, padrao: PADRAO })
}
