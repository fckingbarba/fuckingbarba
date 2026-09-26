"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa } from "@/lib/medusa"
import { reais, type Resultado } from "@/lib/produtos"

/**
 * A META DO MÊS — o valor que o dono escreve ("12.000"); vazio tira. Quem
 * confere o papel (só o dono) e o valor é o Medusa
 * (`POST /dashboard/marketing/meta`). Salvo, o Resumo se refaz.
 */
export async function mudarMeta(valor: string): Promise<Resultado> {
  const r = await medusa("/dashboard/marketing/meta", { token: "sessao", corpo: { valor } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: "A meta, quem muda é o dono." }
  if (r.status === 422)
    return { ok: false, texto: "Não entendi o valor. Escreva em reais, como 12.000." }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/marketing")
  const salvo = r.corpo.valor
  return {
    ok: true,
    texto: typeof salvo === "number" ? `Meta do mês salva: ${reais(salvo)}` : "Meta do mês tirada",
  }
}
