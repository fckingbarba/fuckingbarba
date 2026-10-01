import { MedusaService } from "@medusajs/framework/utils"
import { Oferta } from "./models/oferta"

/** `listOfertas`, `createOfertas`, `updateOfertas`… — o Medusa gera. */
export default class OfertasService extends MedusaService({ Ofertas: Oferta }) {}
