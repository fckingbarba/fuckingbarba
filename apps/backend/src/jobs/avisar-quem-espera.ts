import type { MedusaContainer } from "@medusajs/framework/types"
import { avisarQuemEspera } from "../lib/avise-me"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 5 em 5 minutos, no worker: o avise-me dos esgotados (`lib/avise-me.ts`).
 * Avisa a loja do produto que esgotou ou voltou e manda o e-mail de quem
 * esperava um que voltou.
 *
 * Nos minutos 4, 9, 14… — um depois da cópia do estoque do Bling
 * (`sincronizar-estoque`, nos 3, 8, 13…): o que chegou no Bling já está na
 * loja quando esta roda.
 */
async function avisarQuemEsperaOEstoque(container: MedusaContainer) {
  await avisarQuemEspera(container)
}

export const config = {
  name: "avisar-quem-espera",
  schedule: "4-59/5 * * * *",
}

export default comRodada(config.name, avisarQuemEsperaOEstoque)
