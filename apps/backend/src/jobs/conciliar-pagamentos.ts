import type { MedusaContainer } from "@medusajs/framework/types"
import { conciliarPagamentos } from "../lib/conciliar-pagamentos"

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
 */
export default async function conciliar(container: MedusaContainer) {
  await conciliarPagamentos(container)
}

export const config = {
  name: "conciliar-pagamentos",
  schedule: "*/5 * * * *",
}
