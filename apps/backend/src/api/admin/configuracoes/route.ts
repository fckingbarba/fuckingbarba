import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  CHAVE_NO_METADATA,
  lerConfiguracoes,
  PADRAO,
  type Configuracoes,
} from "../../../lib/configuracoes"
import { mudarMetadataDaLoja } from "../../../lib/metadata-da-loja"
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

  /*
    A peneira roda sobre o corpo embrulhado na mesma forma que o metadata
    tem, pra reaproveitar `lerConfiguracoes` inteiro em vez de escrever uma
    segunda validação que pode divergir da primeira.
  */
  const novas: Configuracoes = lerConfiguracoes({ [CHAVE_NO_METADATA]: req.body })
  const corpo = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
    string,
    unknown
  >

  /*
    Dentro da trava do metadata da loja (`lib/metadata-da-loja.ts`): o
    Medusa grava o metadata da loja inteiro, e a home do painel mora nele
    também. Sem a trava, salvar aqui no mesmo segundo em que alguém publica
    a home apagaria a home publicada.

    O QUE O CORPO NÃO TROUXE FICA COMO ESTÁ. Esta tela não conhece tudo o que
    mora aqui — as integrações, por exemplo, só o painel edita —, e o
    "Salvar" dela zerava o que não mandava.
  */
  let limpas = novas
  const gravou = await mudarMetadataDaLoja(req.scope, (metadata) => {
    const atual = lerConfiguracoes(metadata)
    limpas = Object.fromEntries(
      (Object.keys(novas) as (keyof Configuracoes)[]).map((chave) => [
        chave,
        chave in corpo ? novas[chave] : atual[chave],
      ])
    ) as Configuracoes
    return { gravar: { [CHAVE_NO_METADATA]: limpas }, resultado: true }
  })
  if (!gravou) {
    res.status(404).json({ erro: "nenhuma loja configurada no Medusa" })
    return
  }

  const aviso = await avisarALoja([TAG], logger, "seconds")
  logger.info(`[configuracoes] salvas (frete: ${limpas.frete.modo})`)

  res.json({ configuracoes: limpas, loja_avisada: aviso.avisou, padrao: PADRAO })
}
