import { Module } from "@medusajs/framework/utils"
import AvaliacoesService from "./service"

/**
 * AS AVALIAÇÕES DE QUEM COMPROU — a nota e o texto de cada produto, dados
 * na página escondida `/avaliar` da loja.
 *
 * Entram por `POST /store/avaliacoes` (a loja, com o link assinado do
 * e-mail); o painel aprova ou recusa (`/dashboard/avaliacoes`); a loja
 * mostra as aprovadas (`GET /store/avaliacoes`). O e-mail que pede sai do
 * job `pedir-avaliacoes`. A regra mora em `src/lib/avaliacoes/`. Ver o
 * AGENTS.md, "As avaliações".
 */
export const AVALIACOES = "avaliacoes"

export default Module(AVALIACOES, { service: AvaliacoesService })
