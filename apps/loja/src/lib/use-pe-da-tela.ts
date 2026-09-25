"use client"

import { useEffect, type RefObject } from "react"

/**
 * O PÉ DA TELA — quanto dele uma barra fixa está ocupando.
 *
 * A faixa de cookies mora no pé da tela, e duas telas prendem uma barra ali:
 * a PDP (a barra de compra, quando o botão da dobra sai de vista) e o
 * checkout no celular (o total e o botão do passo). Sem combinar, uma cobria
 * a outra: a barra da PDP escondia os botões da faixa, e a faixa escondia o
 * "Continuar" do checkout. Agora quem prende uma barra embaixo diz a altura
 * dela em `--pe-da-tela`, no <html>, e a faixa fica em cima
 * (`bottom: calc(var(--pe-da-tela, 0px) + …)`, em `consentimento.tsx`).
 *
 * A altura é medida, não escrita: a barra da PDP cresce com o "leve junto", e
 * a do checkout some acima de 900 px (`display: none` mede zero).
 *
 * Cada barra anota a sua num registro, e vale a maior. Uma conta só no <html>
 * não serve: o Next guarda telas visitadas escondidas no documento (o
 * `<Activity>`), e a cópia que se esconde depois apagaria a medida da que
 * está na tela.
 */
const alturas = new Map<HTMLElement, number>()

function aplicar() {
  const maior = Math.max(0, ...alturas.values())
  const raiz = document.documentElement
  if (maior > 0) raiz.style.setProperty("--pe-da-tela", `${maior}px`)
  else raiz.style.removeProperty("--pe-da-tela")
}

export function usePeDaTela(barra: RefObject<HTMLElement | null>, ocupando: boolean) {
  useEffect(() => {
    const el = barra.current
    if (!el || !ocupando) return
    const medir = () => {
      alturas.set(el, el.offsetHeight)
      aplicar()
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => {
      observador.disconnect()
      alturas.delete(el)
      aplicar()
    }
  }, [barra, ocupando])
}
