"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Icone } from "@/components/icones"
import type { Frase } from "@/lib/pedidos"

/**
 * O AVISO DE BAIXO — a frase que volta de uma ação ("Nota autorizada",
 * "Estorno é com o dono"), por alguns segundos.
 *
 * Mora acima da tela, e não no botão: depois da ação a página se refaz, e o
 * botão que foi apertado muitas vezes some (a nota saiu, o estorno andou) —
 * o aviso tem que sobreviver a ele.
 */

const Avisar = createContext<(frase: Frase) => void>(() => {})

export const useAvisar = () => useContext(Avisar)

export function ComAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<(Frase & { vez: number }) | null>(null)

  // O que deu certo some antes; o que não deu fica mais tempo pra ser lido.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), aviso.ok ? 6000 : 10000)
    return () => clearTimeout(t)
  }, [aviso])

  return (
    <Avisar.Provider value={(frase) => setAviso({ ...frase, vez: Date.now() })}>
      {children}
      <div
        className="aviso"
        data-fora={aviso ? undefined : ""}
        data-erro={aviso && !aviso.ok ? "" : undefined}
        data-vez={aviso?.vez}
        role="status"
        aria-live="polite"
      >
        <Icone nome={aviso && !aviso.ok ? "alerta" : "check"} />
        <span>{aviso?.texto}</span>
      </div>
    </Avisar.Provider>
  )
}
