import { Module } from "@medusajs/framework/utils"
import AviseMeService from "./service"

/**
 * O AVISE-ME DOS ESGOTADOS — quem pediu, na página de um produto sem
 * estoque, pra receber um e-mail quando ele voltar.
 *
 * Entra por `POST /store/avise-me` (a loja); sai pelo job
 * `avisar-quem-espera`, que confere o estoque de 5 em 5 minutos e manda o
 * e-mail (`lib/avise-me.ts`). O painel conta quantos esperam em cada
 * produto. Ver o AGENTS.md, "O avise-me".
 */
export const AVISE_ME = "avise_me"

export default Module(AVISE_ME, { service: AviseMeService })
