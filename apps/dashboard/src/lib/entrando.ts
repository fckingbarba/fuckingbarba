import "server-only"
import { cookies } from "next/headers"
import { COOKIE_ENTRANDO } from "./sessao"

const TRINTA_DIAS = 60 * 60 * 24 * 30

/** O mesmo prazo do token (`jwtExpiresIn` no `medusa-config.ts` do backend). */
export const OPCOES_SESSAO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TRINTA_DIAS,
} as const

/**
 * Entre a tela do e-mail e a do código: 15 minutos (o código vale 10), e só
 * nas telas de entrar. Leva o e-mail e a hora do envio — é dela que sai a
 * contagem do "reenviar".
 */
export const OPCOES_ENTRANDO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/entrar",
  maxAge: 15 * 60,
} as const

export type Entrando = { email: string; enviadoEm: number }

export async function lerEntrando(): Promise<Entrando | null> {
  const bruto = (await cookies()).get(COOKIE_ENTRANDO)?.value
  if (!bruto) return null
  try {
    const dado = JSON.parse(bruto) as Partial<Entrando>
    if (typeof dado.email !== "string" || !dado.email) return null
    return { email: dado.email, enviadoEm: typeof dado.enviadoEm === "number" ? dado.enviadoEm : 0 }
  } catch {
    return null
  }
}

export async function gravarEntrando(dado: Entrando) {
  ;(await cookies()).set(COOKIE_ENTRANDO, JSON.stringify(dado), OPCOES_ENTRANDO)
}

/**
 * Quantos segundos faltam pro "reenviar" liberar, contados da hora do envio
 * de verdade (que mora no cookie) — recarregar a tela não zera a espera.
 */
export function segundosParaReenviar(
  entrando: Entrando,
  espera: number,
  agora = Date.now()
): number {
  const passados = Math.floor((agora - entrando.enviadoEm) / 1000)
  return Math.min(espera, Math.max(0, espera - passados))
}
