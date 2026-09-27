import { Module } from "@medusajs/framework/utils"
import CrmService from "./service"

/**
 * O CRM — o começo: o que cada pessoa faz na loja, anotado pela própria
 * loja, e ligado ao e-mail dela (ver o AGENTS.md, "CRM"):
 *
 *   - `crm_visitante`: cada navegador que disse sim aos cookies, e de quem
 *     ele é, quando a pessoa se identifica;
 *   - `crm_evento`: cada coisa que ele fez (viu o produto, pôs na sacola,
 *     escolheu o Pix…).
 *
 * Quem escreve é a rota `POST /store/crm/eventos`, que só a loja chama; a
 * regra do que entra mora em `lib/crm/eventos.ts`. Os fluxos de e-mail vêm
 * nas próximas partes e leem daqui.
 */
export const CRM = "crm"

export default Module(CRM, { service: CrmService })
