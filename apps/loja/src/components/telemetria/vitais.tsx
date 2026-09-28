"use client"

import { useReportWebVitals } from "next/web-vitals"

/**
 * O MEDIDOR DO NEXT, NUM PEDAÇO À PARTE — quem abre é a `Telemetria`
 * (`./telemetria.tsx`), depois da carga da página: ver o porquê lá.
 */
export function Vitais({ aoMedir }: { aoMedir: (m: { name: string; value: number }) => void }) {
  useReportWebVitals(aoMedir)
  return null
}
