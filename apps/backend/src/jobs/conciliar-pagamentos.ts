import type { MedusaContainer } from "@medusajs/framework/types"
import { conciliarPagamentos, rodadaCompleta } from "../lib/conciliar-pagamentos"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * A cada 5 minutos, no worker: põe o Medusa e o Pagar.me de acordo.
 *
 * O que ela resolve está em `src/lib/conciliar-pagamentos.ts`. Em resumo:
 * pagamento que o webhook não entregou, Pix vencido (devolve o estoque),
 * cartão recusado na análise, e cobrança que sumiu no caminho.
 *
 * Cinco minutos porque o cliente olhando a tela de obrigado já tem o webhook
 * (segundos); isto aqui é a rede embaixo dele. Mais frequente só gastaria o
 * limite de leitura da API sem mudar nada que alguém veja.
 *
 * Os casos raros (os órfãos e a conferência dos estornos) vão só na rodada
 * completa, de 30 em 30 minutos (`rodadaCompleta`, entrega 0199): eram ~900
 * chamadas por dia ao Pagar.me e ao Mercado Pago sem nada mudar.
 */
async function conciliar(container: MedusaContainer) {
  const agora = new Date()
  await conciliarPagamentos(container, { agora, completa: rodadaCompleta(agora) })
}

export const config = {
  name: "conciliar-pagamentos",
  schedule: "*/5 * * * *",
}

export default comRodada(config.name, conciliar)
