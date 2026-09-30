"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { semAcessoA } from "@/lib/equipe"
import { medusa, type Resposta } from "@/lib/medusa"

/**
 * O FINANCEIRO — lançar, mudar e apagar despesa; o custo de cada produto e a
 * embalagem; a alíquota do Simples de cada mês. Quem confere a área e cada
 * campo é o Medusa (`/dashboard/financeiro/*`); salvo, as três telas se
 * refazem (o DRE muda junto).
 */

export type ResultadoDoFinanceiro = { ok: boolean; texto: string; campo?: string }

const CAMPOS: Record<string, string> = {
  descricao: "Escreva o que é a despesa.",
  categoria: "Escolha a categoria.",
  valor: "Não entendi o valor. Escreva em reais, como 9.800,00.",
  mes: "Escolha um mês de fevereiro de 2026 até um ano pra frente.",
  aliquota: "Não entendi a alíquota. Escreva em %, como 6,54.",
  desde: "Escolha o dia a partir do qual o custo vale.",
  produto: "Um dos produtos não existe mais. Recarregue a página.",
}

const FORA = "Não consegui falar com a loja agora. Tenta de novo em instantes."

/** O que toda resposta tem em comum: sair, sem acesso, campo errado, fora do ar. */
function problema(r: Resposta): ResultadoDoFinanceiro | null {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("financeiro") }
  if (r.status === 404)
    return { ok: false, texto: "Essa despesa não está mais aqui. Recarregue a página." }
  if (r.status === 422) {
    const campo = typeof r.corpo.campo === "string" ? r.corpo.campo : ""
    return { ok: false, texto: CAMPOS[campo] ?? "Confira os campos.", campo }
  }
  if (r.status !== 200) return { ok: false, texto: FORA }
  return null
}

const refazer = () => revalidatePath("/financeiro", "layout")

export type DespesaNoFormulario = {
  descricao: string
  categoria: string
  valor: string
  mes: string
  repete: boolean
}

export async function lancarDespesa(d: DespesaNoFormulario): Promise<ResultadoDoFinanceiro> {
  const r = await medusa("/dashboard/financeiro/despesas", { token: "sessao", corpo: d })
  const erro = problema(r)
  if (erro) return erro
  refazer()
  return { ok: true, texto: d.repete ? "Despesa lançada, todo mês" : "Despesa lançada" }
}

export async function mudarDespesa(
  id: string,
  visto: string,
  d: DespesaNoFormulario
): Promise<ResultadoDoFinanceiro> {
  const r = await medusa(`/dashboard/financeiro/despesas/${encodeURIComponent(id)}`, {
    token: "sessao",
    corpo: { ...d, visto },
  })
  const erro = problema(r)
  if (erro) return erro
  refazer()
  return { ok: true, texto: "Despesa salva" }
}

export async function apagarDespesa(id: string, visto: string): Promise<ResultadoDoFinanceiro> {
  const r = await medusa(`/dashboard/financeiro/despesas/${encodeURIComponent(id)}/apagar`, {
    token: "sessao",
    corpo: { visto },
  })
  const erro = problema(r)
  if (erro) return erro
  refazer()
  return {
    ok: true,
    texto: r.corpo.parou ? "Tirada deste mês em diante" : "Despesa apagada",
  }
}

export type CustosNoFormulario = {
  custos: { produto: string; valor: string; desde: string }[]
  embalagem: { valor: string; desde: string } | null
  taxaDoPix: { valor: string; desde: string } | null
}

export async function salvarCustos(c: CustosNoFormulario): Promise<ResultadoDoFinanceiro> {
  const r = await medusa("/dashboard/financeiro/custos", { token: "sessao", corpo: c })
  const erro = problema(r)
  if (erro) return erro
  refazer()
  const n = Number(r.corpo.mudaram) || 0
  return { ok: true, texto: n ? "Custos salvos" : "Nada mudou" }
}

export async function salvarSimples(mes: string, aliquota: string): Promise<ResultadoDoFinanceiro> {
  const r = await medusa("/dashboard/financeiro/simples", {
    token: "sessao",
    corpo: { mes, aliquota },
  })
  const erro = problema(r)
  if (erro) return erro
  refazer()
  return {
    ok: true,
    texto: r.corpo.aliquota === null ? "Alíquota tirada" : "Alíquota do Simples salva",
  }
}
