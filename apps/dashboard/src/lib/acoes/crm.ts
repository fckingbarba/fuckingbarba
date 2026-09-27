"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { FormularioDosAjustes } from "@/lib/crm"
import { semAcessoA } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"

/**
 * AS AÇÕES DO CRM — salvar os Ajustes (quanto dura cada produto, as regras
 * das etiquetas). Quem confere campo a campo e grava é o Medusa
 * (`POST /dashboard/crm/ajustes`); o erro volta embaixo do campo. Salvo, a
 * aba se refaz com o que ficou gravado.
 */

export type ResultadoDosAjustes = { ok: boolean; texto: string; erros?: Record<string, string> }

export async function salvarAjustesDoCrm(f: FormularioDosAjustes): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/ajustes", { token: "sessao", corpo: f })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/crm", "layout")
  return { ok: true, texto: "Ajustes salvos. Valem na próxima ficha de cliente que abrir." }
}
