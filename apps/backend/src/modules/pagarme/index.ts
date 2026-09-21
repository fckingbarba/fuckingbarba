import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PagarmeServico from "./service"

/**
 * O módulo do provedor. Registrado no `medusa-config.ts` sob o módulo de
 * pagamento, com `id: "pagarme"` — o que faz o Medusa chamar este provedor
 * de `pp_pagarme_pagarme` (`pp_` + identificador da classe + id do registro).
 * É esse nome que vai na região, pelo `src/scripts/pagamento.ts`, e é por ele
 * que a loja reconhece que pode mostrar Pix e cartão.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [PagarmeServico],
})
