import { MedusaService } from "@medusajs/framework/utils"
import { Inscricao } from "./models/inscricao"

/** `listInscricoes`, `createInscricoes`, `deleteInscricoes`… — o Medusa gera. */
export default class NewsletterService extends MedusaService({ Inscricoes: Inscricao }) {}
