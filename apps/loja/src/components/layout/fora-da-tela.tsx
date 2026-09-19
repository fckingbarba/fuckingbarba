"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * Embrulha uma esteira e a pausa enquanto ela está fora da tela.
 *
 * A faixa de avisos anda sozinha, em CSS. Enquanto ninguém a vê, esse
 * movimento é trabalho de GPU jogado fora — bateria a menos no celular, que é
 * onde a loja vive. Um IntersectionObserver põe e tira `.fora-de-vista`, e o
 * CSS faz o resto (`animation-play-state: paused`).
 *
 * É componente de cliente, mas só a casca: o conteúdo chega pronto do
 * servidor como `children` e não vira JavaScript. O que o navegador baixa
 * daqui é o observador, não os avisos.
 */
export function ForaDaTela({
  children,
  ...props
}: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const alvo = ref.current
    if (!alvo || typeof IntersectionObserver === "undefined") return
    const vigia = new IntersectionObserver(
      ([entrada]) => alvo.classList.toggle("fora-de-vista", !entrada.isIntersecting),
      { rootMargin: "120px" }
    )
    vigia.observe(alvo)
    return () => vigia.disconnect()
  }, [])

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
}
