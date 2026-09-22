"use client"

import { useEffect, useRef } from "react"
import type { EstadoDaEtapa } from "@/lib/checkout-visivel"

/**
 * O QUE UM FORMULÁRIO FAZ QUANDO A AÇÃO RESPONDE — o giro do botão, o
 * recado que não é de campo nenhum e o "salvou, fecha".
 *
 * Moravam em `etapas.tsx`, e saíram quando a Minha conta passou a usar os
 * mesmos (endereços e dados são o passo 1 e o 2 do checkout, fora do
 * checkout). Importar de `etapas.tsx` puxaria o checkout inteiro — contato,
 * entrega, pagamento, resumo — pro JavaScript da conta. `etapas.tsx`
 * reexporta daqui, e o checkout continua importando de lá.
 */

/**
 * O "trabalhando" dos botões do checkout: um quadrado girando, na cor do
 * texto. Quadrado e não círculo — a marca não tem canto redondo em lugar
 * nenhum, e o do campo de CEP (do protótipo) já é assim.
 */
export function Giro() {
  return <span className="giro" aria-hidden="true" />
}

/**
 * O aviso que não é de campo nenhum: rede fora, Medusa recusando, cartão
 * recusado.
 *
 * VEM PRA VISTA quando chega. No celular o botão que a pessoa tocou é o da
 * barra fixa, lá embaixo, e o aviso nasce no meio do formulário — fora da
 * tela, ou atrás da própria barra. Sem isto, a espera acabava e nada parecia
 * ter acontecido. Só em resposta NOVA (`rodada`): o Next devolve o estado da
 * ação a quem navega pra fora e volta, e o recado velho não pode puxar a
 * página sozinho.
 */
export function Recado({ estado }: { estado: EstadoDaEtapa }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const ultima = useRef(estado.rodada)

  useEffect(() => {
    if (estado.rodada === ultima.current) return
    ultima.current = estado.rodada
    if (estado.mensagem) trazerPraVista(ref.current)
  }, [estado.rodada, estado.mensagem])

  if (!estado.mensagem) return null
  return (
    <p className="erros-envio" role="alert" ref={ref}>
      {estado.mensagem}
    </p>
  )
}

/** Rola até o elemento, no meio da tela — sem animação pra quem pediu menos movimento. */
export function trazerPraVista(el: HTMLElement | null) {
  if (!el) return
  const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ block: "center", behavior: calmo ? "auto" : "smooth" })
}

/**
 * Avisa o pai quando um passo foi salvo com sucesso, uma vez por resposta.
 *
 * Olha `rodada`, e não `ok`, porque o Next PRESERVA o estado de
 * `useActionState` quando a pessoa navega pra fora e volta: sem o contador,
 * um passo reaberto dias depois acharia que acabou de ser salvo e se fecharia
 * na cara de quem foi corrigir o endereço.
 */
export function useFechaQuandoSalva<E extends EstadoDaEtapa>(
  estado: E,
  aoSalvar: (estado: E) => void
) {
  const ultima = useRef(estado.rodada)
  useEffect(() => {
    if (estado.rodada !== ultima.current) {
      ultima.current = estado.rodada
      if (estado.ok) aoSalvar(estado)
    }
  }, [estado, aoSalvar])
}
