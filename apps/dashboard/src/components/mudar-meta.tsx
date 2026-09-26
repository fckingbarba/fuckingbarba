"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { mudarMeta } from "@/lib/acoes/marketing"

const VALOR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

/**
 * MUDAR A META DO MÊS — o botão do dono no bloco da meta: abre o campo, em
 * reais ("12.000"), e salva com Enter ou "Salvar"; vazio tira a meta, e Esc
 * desiste. Quem confere o papel e o valor é o Medusa.
 */
export function MudarMeta({ valor, mes }: { valor: number | null; mes: string }) {
  const avisar = useAvisar()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [indo, comecar] = useTransition()
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])

  if (!aberto)
    return (
      <button
        type="button"
        className="btn btn--menor btn--contorno"
        data-mudar-meta
        onClick={() => {
          setTexto(valor === null ? "" : VALOR.format(valor))
          setAberto(true)
        }}
      >
        <Icone nome="lapis" />
        {valor === null ? "Definir a meta" : "Mudar a meta"}
      </button>
    )

  return (
    <form
      className="meta-form"
      aria-busy={indo || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        comecar(async () => {
          const r = await mudarMeta(texto)
          avisar(r)
          if (r.ok) setAberto(false)
        })
      }}
    >
      <label className="meta-form__campo">
        <span className="sr-only">Meta de {mes}, em reais (vazio tira a meta)</span>
        <span aria-hidden="true">R$</span>
        <input
          ref={campo}
          inputMode="decimal"
          autoComplete="off"
          placeholder="12.000"
          value={texto}
          readOnly={indo}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false)
          }}
        />
      </label>
      <button type="submit" className="btn btn--menor" disabled={indo}>
        Salvar
      </button>
      <button
        type="button"
        className="btn btn--menor btn--contorno"
        disabled={indo}
        onClick={() => setAberto(false)}
      >
        Cancelar
      </button>
    </form>
  )
}
