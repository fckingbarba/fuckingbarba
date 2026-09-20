import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FrenetFulfillmentService from "./service"

/**
 * O módulo do provedor. Registrado no `medusa-config.ts` sob o módulo de
 * fulfillment, com `id: "frenet"` — o que faz o Medusa chamar este provedor
 * de `frenet_frenet` (identificador da classe + id do registro). É esse nome
 * que vai no `provider_id` das opções de frete, no `scripts/frete.ts`.
 */
export default ModuleProvider(Modules.FULFILLMENT, {
  services: [FrenetFulfillmentService],
})
