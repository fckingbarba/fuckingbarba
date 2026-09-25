"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * TIRAR UM E-MAIL DE QUEM RECEBE OFERTAS — o "pode sair quando quiser" da
 * Política de Privacidade, pedido pelo cliente à loja. Quem faz é o Medusa
 * (`POST /dashboard/newsletter/tirar`): apaga a inscrição da newsletter e
 * desmarca a caixa de ofertas por e-mail da conta, e anota no registro da
 * equipe. Marketing e dono.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

export async function tirarDaNewsletter(email: string): Promise<Resultado> {
  const r = await medusa("/dashboard/newsletter/tirar", { token: "sessao", corpo: { email } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: "A newsletter é do marketing e do dono." }
  if (r.status === 404) {
    revalidatePath("/clientes/newsletter")
    return { ok: false, texto: "Esse e-mail já tinha saído da lista. A tela foi atualizada." }
  }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/clientes/newsletter")
  revalidatePath("/clientes", "layout")
  return { ok: true, texto: `${email} saiu da lista: não recebe mais ofertas por e-mail.` }
}
