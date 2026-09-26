"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * A FILEIRA DE ABAS QUE ROLA ATÉ A ACESA. No celular as abas não cabem e a
 * fileira rola de lado (`.abas`, em `telas.css`): sem isto, quem abre a
 * sexta ou a sétima aba do Marketing não vê qual está acesa. Só a fileira
 * rola — a página não se mexe.
 */
export function AbasQueRolam({
  rotulo,
  acesa,
  children,
}: {
  rotulo: string
  /** A aba acesa: mudou, a fileira rola de novo. */
  acesa: string
  children: ReactNode
}) {
  const fileira = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = fileira.current
    const aba = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !aba) return
    const n = nav.getBoundingClientRect()
    const a = aba.getBoundingClientRect()
    if (a.left < n.left || a.right > n.right)
      nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2
  }, [acesa])
  return (
    <nav ref={fileira} className="abas" aria-label={rotulo}>
      {children}
    </nav>
  )
}
