import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import MercadoPagoServico from "./service"

/**
 * O módulo do provedor do Mercado Pago. Registrado no `medusa-config.ts` sob
 * o módulo de pagamento, com `id: "mercadopago"` — o que faz o Medusa chamar
 * este provedor de `pp_mercadopago_mercadopago` (o id que está na lista dos
 * parceiros, `lib/pagamento/parceiros.ts`, e na da loja).
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [MercadoPagoServico],
})
