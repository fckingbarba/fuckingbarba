"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * MARCAR UM PROBLEMA COMO RESOLVIDO (ou como visto) — só o de evento; o de
 * estado sai sozinho. Quem decide é o Medusa (`/dashboard/observabilidade`):
 * o papel (dono e operação) e se o problema ainda está aberto. Feito, a tela
 * e o número do menu se refazem.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

export async function resolverProblema(id: string): Promise<Resultado> {
  if (!/^prob_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/observabilidade/problemas/${id}`, {
    token: "sessao",
    corpo: { acao: "resolver" },
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  revalidatePath("/", "layout")
  if (r.status === 403) return { ok: false, texto: "A observabilidade é da operação e do dono." }
  if (r.status === 409)
    return {
      ok: false,
      texto:
        r.corpo.message === "sai_sozinho"
          ? "Esse sai sozinho quando for resolvido."
          : "Alguém já marcou esse.",
    }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return { ok: true, texto: "Marcado. Se acontecer de novo, ele volta." }
}
