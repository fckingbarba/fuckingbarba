import { MedusaService } from "@medusajs/framework/utils"
import { Envio } from "./models/envio"
import { Evento } from "./models/evento"

/**
 * O GUARDA-VOLUMES DO NÚCLEO DE ENVIOS: só as tabelas (`listEnvios`,
 * `createEventos`…, gerados pelo Medusa).
 *
 * A regra — de quem é o aviso, qual a situação, o que mudar no pedido, quem
 * avisar — mora em `src/lib/envios/`, porque precisa de outros módulos
 * (pedido, fulfillment, trava) que um módulo do Medusa não enxerga.
 *
 * AS CHAVES SÃO NO PLURAL DE PROPÓSITO. O Medusa monta o nome dos métodos
 * pluralizando a chave em inglês, e o TIPO dele pluraliza "Envio" como
 * "Envioes" (a regra de "potato") enquanto o código de verdade gera
 * "Envios". Com a chave já no plural, os dois concordam: `listEnvios`.
 */
export default class EnviosService extends MedusaService({ Envios: Envio, Eventos: Evento }) {}
