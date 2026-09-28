import { MedusaService } from "@medusajs/framework/utils"
import { Inscricao } from "./models/inscricao"

/** `listInscricoes`, `createInscricoes`, `updateInscricoes`… — o Medusa gera. */
export default class CriadoresService extends MedusaService({ Inscricoes: Inscricao }) {}
