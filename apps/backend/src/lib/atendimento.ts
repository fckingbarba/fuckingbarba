import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "./configuracoes"

/**
 * O WhatsApp da loja — só dígitos, com DDI (5547999990000) —, das
 * configurações que o admin edita. É o "chama no WhatsApp com o número do
 * pedido" dos e-mails de pedido e de envio.
 *
 * `null` quando não está configurado ou quando a leitura falha: o e-mail
 * troca a frase por "guarde o número do pedido", e sai do mesmo jeito. Um
 * telefone que faltou não vale um e-mail que não saiu.
 */
export async function whatsappDaLoja(container: MedusaContainer): Promise<string | null> {
  try {
    const [loja] = await container
      .resolve(Modules.STORE)
      .listStores({}, { select: ["id", "metadata"], take: 1 })
    return lerConfiguracoes(loja?.metadata).atendimento.whatsapp
  } catch {
    return null
  }
}
