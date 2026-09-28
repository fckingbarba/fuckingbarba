import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"
import { whatsappDaLoja } from "../../../lib/atendimento"
import { linkDoPedido } from "../../../lib/avaliacoes/link"
import { checkinDoToken, whatsappDaDuvida } from "../../../lib/crm/checkin"
import { linkDaAvaliacao } from "../../../lib/emails/avaliacao"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"

/**
 * O BOTÃO DO "COMO TÁ INDO?" — `GET /crm/checkin?t=…` (`lib/crm/checkin.ts`),
 * o check-in de 7 dias da jornada do resultado (entrega 0187). Anota a
 * resposta e manda pra onde ela leva:
 *
 *   - "Tá indo bem": a página de avaliar o pedido, com o primeiro produto;
 *   - "Tenho uma dúvida": o WhatsApp da loja, com a mensagem pronta (sem o
 *     número nas Configurações, a página de contato).
 *
 * Fora do `/store`, como o sair da lista: quem chama é o e-mail. Link torto,
 * ou limite estourado: vai pra home da loja, sem anotar nada. RESPOSTA: 303.
 */

const HORA = 60 * 60 * 1000
const POR_IP = { limite: 60, ms: HORA }
const limite = criarLimite()
const CAMPANHA = "utm_source=loja&utm_medium=email&utm_campaign=crm-jornada"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const loja = urlDaLoja() ?? ""
  const checkin = checkinDoToken((req.query as { t?: unknown }).t)
  const quem = quemPede(req)
  if (!checkin || !limite.cabe(quem.chave, POR_IP)) {
    res.redirect(303, `${loja}/?${CAMPANHA}`)
    return
  }
  limite.contar(quem.chave, POR_IP)
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "email", "display_id", "items.product_id"],
    filters: { id: checkin.pedido },
  })
  const pedido = data[0] as
    | {
        id: string
        email?: string | null
        display_id?: number | null
        items?: { product_id?: string | null }[] | null
      }
    | undefined
  if (!pedido?.email) {
    res.redirect(303, `${loja}/?${CAMPANHA}`)
    return
  }
  await req.scope
    .resolve<CrmService>(CRM)
    .anotarCheckin(pedido.email.trim().toLowerCase(), pedido.id, checkin.resposta)
  if (checkin.resposta === "bem") {
    const produto = pedido.items?.find((i) => i.product_id)?.product_id ?? ""
    res.redirect(303, linkDaAvaliacao(loja, linkDoPedido(pedido.id), produto))
    return
  }
  const whatsapp = whatsappDaDuvida(await whatsappDaLoja(req.scope), pedido.display_id ?? null)
  res.redirect(303, whatsapp ?? `${loja}/contato?${CAMPANHA}`)
}
