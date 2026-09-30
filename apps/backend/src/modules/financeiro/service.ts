import { MedusaService } from "@medusajs/framework/utils"
import { Despesa } from "./models/despesa"
import { CustoDoPedido } from "./models/pedido"
import { Valor } from "./models/valor"

/**
 * `listDespesas`, `createDespesas`, `listValores`, `updateValores`,
 * `listCustosDosPedidos`… — o Medusa gera.
 */
export default class FinanceiroService extends MedusaService({
  Despesas: Despesa,
  Valores: Valor,
  CustosDosPedidos: CustoDoPedido,
}) {}
