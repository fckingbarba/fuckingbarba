"use client"

import { useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Icone } from "@/components/icones"

/**
 * A GAVETA — o formulário que abre por cima, do lado direito (o celular
 * inteiro). É um diálogo: o foco entra no primeiro campo, fica dentro
 * enquanto ela está aberta e volta pra onde estava ao fechar. Fecha no ✕,
 * no Esc e no fundo escuro.
 *
 * Mora no `<body>` (portal), e não onde é chamada: aberta de dentro de um
 * `.bloco` (a seção da página do produto), ela herdava o recorte do chanfro
 * dele e saía cortada.
 */
export function Gaveta({
  titulo,
  fechar,
  children,
}: {
  titulo: string
  fechar: () => void
  children: ReactNode
}) {
  const id = useId()
  const caixa = useRef<HTMLElement>(null)

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    const primeiro = caixa.current?.querySelector<HTMLElement>(
      ".gaveta__corpo input, .gaveta__corpo select, .gaveta__corpo textarea, .gaveta__corpo button"
    )
    primeiro?.focus()
    document.body.style.overflow = "hidden"

    function tecla(ev: KeyboardEvent) {
      if (ev.key === "Escape") fechar()
      if (ev.key !== "Tab" || !caixa.current) return
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
      )
      if (!focaveis.length) return
      const um = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (ev.shiftKey && document.activeElement === um) {
        ev.preventDefault()
        ultimo.focus()
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault()
        um.focus()
      }
    }
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("keydown", tecla)
      document.body.style.overflow = ""
      antes?.focus()
    }
  }, [fechar])

  return createPortal(
    <>
      <div className="gaveta-fundo" onClick={fechar} aria-hidden="true" />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-labelledby={id} ref={caixa}>
        <div className="gaveta__topo">
          <p className="gaveta__titulo" id={id}>
            {titulo}
          </p>
          <button type="button" className="folha__fechar" aria-label="Fechar" onClick={fechar}>
            <Icone nome="fechar" />
          </button>
        </div>
        <div className="gaveta__corpo">{children}</div>
      </aside>
    </>,
    document.body
  )
}
