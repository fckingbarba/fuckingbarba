"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { OPCOES_SESSAO } from "@/lib/entrando"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * O BOTÃO "SAIR". O token continua válido no Medusa até vencer (é assim que
 * JWT funciona), mas ele só existia neste cookie, que nenhum JavaScript lê.
 */
export async function sair() {
  ;(await cookies()).set(COOKIE_SESSAO, "", { ...OPCOES_SESSAO, maxAge: 0 })
  redirect("/entrar?saiu=1")
}
