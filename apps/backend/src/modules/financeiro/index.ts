import { Module } from "@medusajs/framework/utils"
import FinanceiroService from "./service"

/**
 * O FINANCEIRO — o que o DRE da loja precisa e o sistema não sabe sozinho:
 * as despesas que o dono lança e o custo de cada produto, a embalagem e a
 * alíquota do Simples, cada um valendo a partir de um dia.
 *
 * As vendas, os descontos e os estornos vêm dos pedidos (a loja nova e a
 * Nuvemshop, do CRM). O painel lê e grava por `/dashboard/financeiro` (a área
 * "Financeiro", só do dono no padrão); a conta mora em `src/lib/financeiro/`.
 * Ver o AGENTS.md, "O Financeiro".
 */
export const FINANCEIRO = "financeiro"

export default Module(FINANCEIRO, { service: FinanceiroService })
