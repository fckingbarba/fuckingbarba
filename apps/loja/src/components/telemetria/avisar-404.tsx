"use client"

import { useEffect } from "react"
import { mandar, paginaAgora } from "@/lib/telemetria"

/**
 * A PÁGINA QUE NÃO EXISTE conta que alguém caiu nela — e de onde veio
 * (`document.referrer`; o Medusa guarda só o domínio). Mora no
 * `app/not-found.tsx`. Uma vez por caminho, mesmo com a tela desenhada duas
 * vezes.
 */
const avisadas = new Set<string>()

export function Avisar404() {
  useEffect(() => {
    const pagina = paginaAgora()
    if (avisadas.has(pagina)) return
    avisadas.add(pagina)
    mandar({ tipo: "404", pagina, origem: document.referrer })
  }, [])
  return null
}
