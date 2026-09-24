import "server-only"
import { cache } from "react"
import { medusa } from "@/lib/medusa"

/**
 * AS VISITAS DO DIA, do lado do painel — o formato da resposta de
 * `GET /dashboard/visitas` (cópia dos tipos de
 * `apps/backend/src/lib/painel/visitas.ts`: quem mudar um, muda o outro).
 *
 * O dono e o marketing recebem o bloco inteiro; a operação, só o número —
 * quem corta é o backend.
 */

export type Barra = { nome: string; visitas: number }

/** Hoje contra ontem, da 0h até `ate`h — só as horas que o Google já somou hoje. */
export type Comparacao = { ate: number; hoje: number; ontem: number }

export type NumeroDeVisitas = { hoje: number; comparacao: Comparacao | null }

export type Visitas = NumeroDeVisitas & {
  porHora: number[]
  /** Ontem inteiro. */
  ontem: number
  agora: number
  origens: Barra[]
  maisVistos: Barra[]
}

export type RespostaDasVisitas =
  | { estado: "ok"; visitas: NumeroDeVisitas | Visitas }
  | { estado: "desligado" | "invalida" | "recusado" | "fora" | "carregando" }

export const temOBloco = (v: NumeroDeVisitas | Visitas): v is Visitas => "porHora" in v

/**
 * Uma pergunta por página: o número de cima e o bloco de baixo leem a mesma
 * resposta (`cache` do React). O Google pode demorar — quem chama põe isto
 * num `<Suspense>`, e o resto do Início não espera.
 */
export const lerVisitas = cache(async (): Promise<RespostaDasVisitas> => {
  const r = await medusa("/dashboard/visitas", { metodo: "GET", token: "sessao" })
  const estado = r.corpo.estado
  if (r.status === 200 && estado === "ok" && r.corpo.visitas)
    return { estado, visitas: r.corpo.visitas as NumeroDeVisitas | Visitas }
  if (
    r.status === 200 &&
    (estado === "desligado" || estado === "invalida" || estado === "recusado")
  )
    return { estado }
  return { estado: "fora" }
})
