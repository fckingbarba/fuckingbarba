"use server"

import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import type { EstadoDaNewsletter } from "@/lib/newsletter-visivel"

/**
 * A inscrição do rodapé — manda pro Medusa (`POST /store/newsletter`), que
 * guarda o e-mail com a data do consentimento.
 *
 * O IP de quem pede vai assinado (`cabecalhosDeQuemPede`), pra o limite
 * contar por pessoa e não pela Vercel inteira — o mesmo do código da conta.
 */

const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

export async function inscreverNaNewsletter(
  _anterior: EstadoDaNewsletter,
  fd: FormData
): Promise<EstadoDaNewsletter> {
  const email = String(fd.get("email") ?? "").trim()
  if (!ehEmail(email)) {
    return { tipo: "erro", texto: "Esse e-mail não parece certo. Confere e tenta de novo.", email }
  }

  const r = await medusa("/store/newsletter", {
    corpo: { email, origem: "rodape" },
    extras: await cabecalhosDeQuemPede(),
  })

  if (r.status === 200) return { tipo: "ok" }
  if (r.status === 400) {
    return { tipo: "erro", texto: "Esse e-mail não parece certo. Confere e tenta de novo.", email }
  }
  if (r.status === 429) {
    return {
      tipo: "erro",
      texto: "Muitas inscrições daqui agora. Tenta de novo mais tarde.",
      email,
    }
  }
  return {
    tipo: "erro",
    texto: "Não consegui guardar seu e-mail agora. Tenta de novo em instantes.",
    email,
  }
}
