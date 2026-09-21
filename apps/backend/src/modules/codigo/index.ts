import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CodigoDeAcesso from "./service"

/**
 * O provedor de auth do código por e-mail. Registrado no `medusa-config.ts`
 * sob o módulo de auth, com `id: "codigo"` — que é o que aparece na rota
 * (`/auth/customer/codigo`) e no `provider` da identidade no banco.
 */
export default ModuleProvider(Modules.AUTH, {
  services: [CodigoDeAcesso],
})
