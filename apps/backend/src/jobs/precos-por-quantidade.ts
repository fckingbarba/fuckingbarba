import type { MedusaContainer } from "@medusajs/framework/types"
import { sincronizarPrecosPorQuantidade } from "../lib/precos-por-quantidade"

/**
 * DE 15 EM 15 MINUTOS, o desconto por quantidade acompanha o preço.
 *
 * O preço de 2 e de 3 unidades sai do preço de UMA — e quem muda esse preço
 * é o admin, a qualquer hora, sem avisar ninguém. Em vez de caçar cada
 * caminho por onde um preço muda (a variação, a lista da promoção, uma
 * promoção nova, uma que venceu), o job refaz a conta inteira e só escreve
 * o que mudou. Rodada sem mudança não toca no banco nem na loja.
 *
 * O minuto 7 é pra não cair junto dos outros jobs, que rodam de 5 em 5.
 */
export default async function precosPorQuantidade(container: MedusaContainer) {
  await sincronizarPrecosPorQuantidade(container)
}

export const config = {
  name: "precos-por-quantidade",
  schedule: "7-59/15 * * * *",
}
