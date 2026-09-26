"use server"

import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import type { EstadoDoAviso } from "@/lib/avise-me-visivel"

/**
 * O "avise-me" da página esgotada — manda pro Medusa (`POST /store/avise-me`),
 * que guarda o e-mail e o produto até ele voltar; aí sai um e-mail só.
 *
 * O IP de quem pede vai assinado (`cabecalhosDeQuemPede`), pra o limite
 * contar por pessoa e não pela Vercel inteira — o mesmo da newsletter.
 */

const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

const EMAIL_ERRADO = "Esse e-mail não parece certo. Confere e tenta de novo."

export async function pedirAviso(_anterior: EstadoDoAviso, fd: FormData): Promise<EstadoDoAviso> {
  const email = String(fd.get("email") ?? "").trim()
  const variante = String(fd.get("variante") ?? "")
  if (!ehEmail(email)) return { tipo: "erro", texto: EMAIL_ERRADO, email }

  const r = await medusa("/store/avise-me", {
    corpo: { email, variante },
    extras: await cabecalhosDeQuemPede(),
  })

  if (r.status === 200) return { tipo: "ok", email }
  if (r.status === 409) return { tipo: "voltou" }
  if (r.status === 400 && r.corpo.message === "email_invalido") {
    return { tipo: "erro", texto: EMAIL_ERRADO, email }
  }
  if (r.status === 400) {
    return {
      tipo: "erro",
      texto: "Esse produto saiu do site, e não tem como avisar dele. Dá uma olhada nos outros.",
      email,
    }
  }
  if (r.status === 429) {
    return { tipo: "erro", texto: "Muitos pedidos daqui agora. Tenta de novo mais tarde.", email }
  }
  return {
    tipo: "erro",
    texto: "Não consegui guardar seu e-mail agora. Tenta de novo em instantes.",
    email,
  }
}
