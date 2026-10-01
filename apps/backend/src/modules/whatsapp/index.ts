import { Module } from "@medusajs/framework/utils"
import WhatsappService from "./service"

/**
 * O WHATSAPP DA LOJA — as conversas com quem escreve pro número da loja, e o
 * que o atendente (a IA) e a equipe responderam.
 *
 * Chega por `POST /hooks/whatsapp` (o webhook do app na Meta); o job
 * `responder-no-whatsapp` responde de minuto em minuto. A regra mora em
 * `src/lib/whatsapp/`. Ver o AGENTS.md, "O WhatsApp da loja".
 */
export const WHATSAPP = "whatsapp"

export default Module(WHATSAPP, { service: WhatsappService })
