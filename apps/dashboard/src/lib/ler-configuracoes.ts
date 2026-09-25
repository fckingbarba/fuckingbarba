import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import type { TelaDasConfiguracoes } from "./configuracoes"
import { medusa } from "./medusa"

/**
 * As configurações, uma pergunta ao Medusa por página (o `cache` junta a aba
 * e o que mais pedir no mesmo carregamento). `null`: o Medusa não respondeu.
 * Sem sessão, ou fora da equipe, vai pro `/sair`; sem o papel, 403 vira a
 * tela de sem acesso (`"sem-acesso"`).
 */
export const lerConfiguracoes = cache(
  async (): Promise<TelaDasConfiguracoes | "sem-acesso" | null> => {
    const r = await medusa("/dashboard/configuracoes", { metodo: "GET", token: "sessao" })
    if (r.status === 401)
      redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
    if (r.status === 403) return "sem-acesso"
    if (r.status !== 200) return null
    return r.corpo as unknown as TelaDasConfiguracoes
  }
)
