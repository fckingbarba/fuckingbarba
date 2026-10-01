import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { acertarPrecosDasOfertas } from "../lib/ofertas/lista"
import { sincronizarPrecosPorQuantidade } from "../lib/precos-por-quantidade"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * DE MINUTO EM MINUTO, o desconto por quantidade acompanha o preço.
 *
 * O preço de 2 e de 3 unidades sai do preço de UMA — e quem muda esse preço
 * é o admin, a qualquer hora, sem avisar ninguém. Em vez de caçar cada
 * caminho por onde um preço muda (a variação, a lista da promoção, uma
 * promoção nova, uma que venceu), o job refaz a conta inteira e só escreve
 * o que mudou. Rodada sem mudança não toca no banco nem na loja.
 *
 * Era de 15 em 15 minutos, e cada promoção encerrada deixava até 15 minutos
 * de 2 e 3 unidades vendidas pelo preço da promoção — ver "POR QUE DE MINUTO
 * EM MINUTO" em `lib/precos-por-quantidade.ts`.
 *
 * LOGO DEPOIS, AS OFERTAS OCULTAS: a lista de cada uma guarda o menor entre
 * o "por" e o preço de hoje (e as faixas abaixo dele) — ver
 * `lib/ofertas/regras.ts`. Sem oferta aberta, nem lê.
 */
async function precosPorQuantidade(container: MedusaContainer) {
  await sincronizarPrecosPorQuantidade(container)
  await acertarPrecosDasOfertas(container).catch((e) =>
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[ofertas] os preços das ofertas ficam pra próxima rodada: ${e}`)
  )
}

export const config = {
  name: "precos-por-quantidade",
  schedule: "* * * * *",
}

export default comRodada(config.name, precosPorQuantidade)
