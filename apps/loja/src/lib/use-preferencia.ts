"use client"

import { useSyncExternalStore } from "react"

/**
 * Lê uma media query como estado do React.
 *
 * Por que não um `useEffect` com `setState`: a preferência do sistema é
 * estado que vive **fora** do React e pode mudar a qualquer momento (a pessoa
 * liga "reduzir movimento" no meio da visita). `useSyncExternalStore` é a
 * ferramenta exata pra isso — assina a fonte, lê o valor na hora da
 * renderização e não provoca a renderização em cascata que o `setState`
 * dentro de efeito provoca.
 *
 * No servidor devolve `false`: lá não existe media query, e partir do
 * "sem preferência especial" é o que mantém o HTML igual pra todo mundo —
 * que é o que o cache do CDN precisa.
 *
 * Os nomes ficam com `use` em inglês, fora do padrão do resto do projeto,
 * pelo mesmo motivo do `useCarrossel`: o prefixo é contrato do React, não
 * prosa — é por ele que a regra dos hooks reconhece um hook.
 */
function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      const mq = window.matchMedia(consulta)
      mq.addEventListener("change", aoMudar)
      return () => mq.removeEventListener("change", aoMudar)
    },
    () => window.matchMedia(consulta).matches,
    () => false
  )
}

/** A pessoa pediu menos movimento no sistema. */
export function useMovimentoReduzido(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)")
}
