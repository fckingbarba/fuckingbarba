import { MedusaService } from "@medusajs/framework/utils"
import { Conexao } from "./models/conexao"
import { Nota } from "./models/nota"

/**
 * O GUARDA-VOLUMES DO ERP: só as tabelas (`listConexoes`, `updateNotas`…,
 * gerados pelo Medusa).
 *
 * A regra — quando emitir, o que fazer com o cancelado, como espelhar o
 * estoque — mora em `src/lib/erp/`, porque precisa de outros módulos
 * (pedido, estoque, trava) que um módulo do Medusa não enxerga. E o que é
 * FORMATO de um ERP mora no tradutor dele (`src/modules/bling/`).
 *
 * AS CHAVES SÃO NO PLURAL DE PROPÓSITO, como no módulo de envios: o tipo do
 * Medusa pluraliza "Conexao" do jeito dele e o código de verdade de outro, e
 * com a chave já no plural os dois concordam.
 */
export default class ErpService extends MedusaService({ Conexoes: Conexao, Notas: Nota }) {}
