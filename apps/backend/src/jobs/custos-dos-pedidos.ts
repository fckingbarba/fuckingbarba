import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { custosDosPedidos } from "../lib/financeiro/custos-dos-pedidos"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 30 em 30 minutos, no worker: a taxa que o Pagar.me ou o Mercado Pago
 * cobrou em cada pedido pago da loja nova e, no pedido sem a cotação da
 * Frenet do checkout, o frete cotado agora — pro DRE do Financeiro
 * (`lib/financeiro/custos-dos-pedidos.ts`).
 *
 * Nos minutos 14 e 44 — longe dos 0, 5, 10… da conciliação (que confirma o
 * pagamento) e dos 6, 16, 26… do registro na Frenet. Sem nada pendente,
 * volta depois de uma leitura de pedidos e uma do `fin_pedido`.
 */
async function buscarCustos(container: MedusaContainer) {
  const r = await custosDosPedidos(container)
  if (r.taxas || r.fretes || r.erros.length)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(
        `[financeiro] ${r.taxas} taxa(s) e ${r.fretes} frete(s) lidos; ${r.semResposta} ainda sem resposta` +
          (r.erros.length ? `; não deu: ${r.erros.slice(0, 3).join(" | ")}` : "")
      )
}

export const config = {
  name: "custos-dos-pedidos",
  schedule: "14-59/30 * * * *",
}

export default comRodada(config.name, buscarCustos)
