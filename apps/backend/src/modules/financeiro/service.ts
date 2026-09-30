import { MedusaService } from "@medusajs/framework/utils"
import { Despesa } from "./models/despesa"
import { Valor } from "./models/valor"

/** `listDespesas`, `createDespesas`, `listValores`, `updateValores`… — o Medusa gera. */
export default class FinanceiroService extends MedusaService({
  Despesas: Despesa,
  Valores: Valor,
}) {}
