import { Module } from "@medusajs/framework/utils"
import OfertasService from "./service"

/**
 * AS OFERTAS OCULTAS — produtos da loja com um preço só pra quem abre o
 * link (`/oferta/<endereço>` na loja), até a data de fim. Fora do menu, do
 * sitemap e do Google: quem não tem o link vê o preço de sempre.
 *
 * O módulo guarda o que o painel escolheu (o nome, os produtos e o "por" de
 * cada um, o começo e o fim); o preço que o carrinho cobra mora numa lista
 * de preço do Medusa com a regra `fb_oferta` (`src/lib/ofertas/`). Ver o
 * AGENTS.md, "As ofertas ocultas".
 */
export const OFERTAS = "ofertas"

export default Module(OFERTAS, { service: OfertasService })
