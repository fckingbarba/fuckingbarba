"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { semAcessoA } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * APROVAR, RECUSAR OU APAGAR uma avaliação — quem decide é o Medusa
 * (`POST /dashboard/avaliacoes/:id`), que confere o papel, grava, avisa a
 * loja quando o site muda e deixa a linha no registro da equipe. Apagar é
 * de vez, e só a recusada. Feito, a lista e o Início (o "N avaliações
 * esperando") se refazem.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

export type AcaoDaAvaliacao = "aprovar" | "recusar" | "apagar"

const FEITO: Record<AcaoDaAvaliacao, string> = {
  aprovar: "Aprovada: a avaliação já está no site.",
  recusar: "Recusada: a avaliação não aparece no site.",
  apagar: "Apagada de vez: a avaliação saiu da loja.",
}

export async function moderarAvaliacao(id: string, acao: AcaoDaAvaliacao): Promise<Resultado> {
  if (!/^aval_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/avaliacoes/${id}`, { token: "sessao", corpo: { acao } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  revalidatePath("/avaliacoes")
  if (r.status === 403) return { ok: false, texto: semAcessoA("avaliacoes") }
  if (r.status === 404)
    return { ok: false, texto: "Essa avaliação não existe mais. A lista foi atualizada." }
  if (r.status === 409)
    return { ok: false, texto: "Só dá pra apagar uma avaliação recusada. A lista foi atualizada." }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/")
  return { ok: true, texto: FEITO[acao] }
}
