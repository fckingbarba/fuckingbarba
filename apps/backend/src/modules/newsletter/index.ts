import { Module } from "@medusajs/framework/utils"
import NewsletterService from "./service"

/**
 * A lista da newsletter do rodapé — ver `api/store/newsletter` (quem entra)
 * e a tela "Newsletter" do admin (quem vê, baixa e remove).
 *
 * Mora no Medusa, e não na tabela `loja.newsletter` do Supabase que o plano
 * original previa: a Edge Function que gravaria lá precisa de deploy à mão
 * pela linha de comando do Supabase; o módulo sobe junto com o backend, e a
 * tabela nasce na migração que o Railway já roda em todo deploy.
 */
export const NEWSLETTER = "newsletter"

export default Module(NEWSLETTER, { service: NewsletterService })
