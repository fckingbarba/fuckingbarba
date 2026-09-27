import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sincronizarPrecosPorQuantidade } from "../precos-por-quantidade"
import { esquecerPromocoes } from "../promocoes-ativas"
import { avisarALoja } from "../revalidar"

/**
 * Depois de criar, pausar ou ligar: o carrinho e a rota da loja leem as
 * promoções de novo, as faixas de quantidade se refazem (e avisam a loja se
 * mudaram), e a loja é avisada de qualquer jeito — o selo pode mudar sem
 * faixa nenhuma mudar (promoção em produto que já estava fora delas). Nada
 * disso desfaz o que já foi gravado: falhou, fica no log, e a rodada de
 * minuto em minuto acerta.
 *
 * O AVISO É "AGORA", e não "seconds": com "seconds" a loja serve a página
 * velha e refaz por trás — e a página refeita lia a escada e a lista de
 * promoções guardadas, velhas também. A promoção pausada seguia com o selo
 * na página do produto (visto no conferidor da 0133). Com "agora", a próxima
 * visita espera a página nova, com tudo relido: oferta anunciada vincula.
 */
export async function valerNaLoja(scope: MedusaContainer) {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  esquecerPromocoes()
  try {
    await sincronizarPrecosPorQuantidade(scope)
  } catch (e) {
    logger.warn(`[promocoes] as faixas de quantidade não se refizeram agora (o job refaz): ${e}`)
  }
  await avisarALoja(["produtos"], logger, "agora")
}
