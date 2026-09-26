import { MedusaService } from "@medusajs/framework/utils"
import { Aviso } from "./models/aviso"

/** `listAvisos`, `createAvisos`, `updateAvisos`, `deleteAvisos`… — o Medusa gera. */
export default class AviseMeService extends MedusaService({ Avisos: Aviso }) {}
