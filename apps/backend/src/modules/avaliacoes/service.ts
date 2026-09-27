import { MedusaService } from "@medusajs/framework/utils"
import { Avaliacao } from "./models/avaliacao"

/**
 * `listAvaliacoes`, `createAvaliacoes`, `updateAvaliacoes`… — o Medusa gera.
 *
 * A CHAVE JÁ NO PLURAL, como a dos envios: o tipo do Medusa pluraliza em
 * inglês ("Avaliacao" viraria "Avaliacaos"), e com `Avaliacoes` o nome dos
 * métodos é o mesmo no tipo e no código.
 */
export default class AvaliacoesService extends MedusaService({ Avaliacoes: Avaliacao }) {}
