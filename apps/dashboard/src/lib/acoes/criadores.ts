"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { semAcessoA } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * APROVAR, RECUSAR OU APAGAR uma inscrição de criador — quem decide é o
 * Medusa (`POST /dashboard/criadores/:id`), que confere o papel, grava e
 * deixa a linha no registro da equipe. Apagar é de vez, e só a recusada.
 * Feito, a lista se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

export type AcaoDoCriador = "aprovar" | "recusar" | "apagar"

const FEITO: Record<AcaoDoCriador, string> = {
  aprovar: "Aprovada: agora é chamar no WhatsApp pra fechar.",
  recusar: "Recusada: a inscrição foi pra fita das recusadas.",
  apagar: "Apagada de vez: a inscrição saiu da loja.",
}

export async function decidirCriador(id: string, acao: AcaoDoCriador): Promise<Resultado> {
  if (!/^cria_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/criadores/${id}`, { token: "sessao", corpo: { acao } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  revalidatePath("/criadores")
  if (r.status === 403) return { ok: false, texto: semAcessoA("criadores") }
  if (r.status === 404)
    return { ok: false, texto: "Essa inscrição não existe mais. A lista foi atualizada." }
  if (r.status === 409)
    return { ok: false, texto: "Só dá pra apagar uma inscrição recusada. A lista foi atualizada." }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return { ok: true, texto: FEITO[acao] }
}
