"use client"

import { useState } from "react"
import { ID_ESTRELA } from "@/components/estrelas"
import { FRASE_DA_NOTA, NOTAS } from "@/lib/avaliar-visivel"

/**
 * AS ESTRELAS DA AVALIAÇÃO — os rádios de 1 a 5, grandes pra caber o dedo.
 * Acendem até onde o mouse está (ou até a nota), e a frase ao lado diz em
 * palavras o que cada uma quer dizer. Os dois formulários da `/avaliar`
 * usam: o do link do e-mail e o sem o link.
 *
 * Quem guarda a nota é o formulário (`nota`): ela volta com ele depois de um
 * erro.
 */
export function EscolhaDaNota({
  nota,
  aoEscolher,
  erro,
  id,
}: {
  nota: number
  aoEscolher: (n: number) => void
  erro: string
  /** O `useId` do formulário: o erro fica em `<id>-nota`. */
  id: string
}) {
  const [sobre, setSobre] = useState(0)
  const frase = FRASE_DA_NOTA[sobre || nota] ?? "Toque nas estrelas"
  return (
    <fieldset className="avaliar__grupo" aria-describedby={`${id}-nota`}>
      <legend>Sua nota</legend>
      <div className="avaliar__estrelas" onMouseLeave={() => setSobre(0)}>
        {NOTAS.map((n) => (
          <label
            key={n}
            className="avaliar__estrela"
            data-acesa={(sobre || nota) >= n || undefined}
            onMouseEnter={() => setSobre(n)}
          >
            <input
              type="radio"
              name="nota"
              value={n}
              checked={nota === n}
              onChange={() => aoEscolher(n)}
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href={`#${ID_ESTRELA}`} />
            </svg>
            <span className="sr-only">
              {n} {n === 1 ? "estrela" : "estrelas"}: {FRASE_DA_NOTA[n]}
            </span>
          </label>
        ))}
        <span className="avaliar__frase" aria-hidden="true">
          {frase}
        </span>
      </div>
      <span className="campo__erro" id={`${id}-nota`} aria-live="polite">
        {erro}
      </span>
    </fieldset>
  )
}
