import type { ReactNode } from "react"
import { EmBreve, SemAcesso } from "@/components/telas"
import type { Area } from "@/lib/equipe"
import { lerMembro } from "@/lib/eu"

/**
 * A TELA DE UMA ÁREA — só pra quem o papel abre. A casca já perguntou quem
 * é (a leitura é a mesma, pelo `cache`); aqui só se confere a área. Quem
 * barra de verdade é o Medusa, rota por rota: isto é pra quem digitou o
 * endereço na mão ver uma tela que explica, e não um erro.
 */
export async function SoPara({ area, children }: { area: Area; children: ReactNode }) {
  const leitura = await lerMembro()
  if (leitura.estado !== "ok") return null
  if (!leitura.areas.includes(area)) return <SemAcesso area={area} />
  return children
}

/** A área que ainda não tem tela: o que ela vai fazer, e em que fase chega. */
export function AreaEmBreve({ area }: { area: Area }) {
  return (
    <SoPara area={area}>
      <EmBreve area={area} />
    </SoPara>
  )
}
