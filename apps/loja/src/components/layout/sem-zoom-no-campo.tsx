"use client"

import { useEffect } from "react"

/**
 * O IPHONE NÃO DÁ ZOOM AO TOCAR NUM CAMPO.
 *
 * O Safari do iPhone amplia a página inteira quando o campo tocado tem letra
 * menor que 16px — e a pessoa volta pra uma tela ampliada e cortada, no meio
 * do checkout. Os campos da loja já têm 16px no celular (as regras
 * `pointer: coarse` de cada CSS). Mesmo assim o zoom aparece quando o Safari
 * está com a página reduzida (o "aA" abaixo de 100%, que ele guarda por
 * site): os 16px do CSS viram 13 na tela.
 *
 * `maximum-scale=1` desliga esse zoom automático — SÓ NO iPHONE E NO iPAD.
 * Desde o iOS 10 o Safari ignora o `maximum-scale` na pinça: a pessoa
 * continua ampliando com dois dedos. No Android o mesmo atributo TRAVA a
 * pinça, o que é problema de acessibilidade (o Lighthouse reprova), e por
 * isso ele não vai no `viewport` do layout, que vale pra todo mundo.
 *
 * Depois de o React assumir, e não antes: tocar num campo antes disso é
 * raro, e o zoom daquela vez é tudo o que se perde.
 */
export function SemZoomNoCampo() {
  useEffect(() => {
    const agente = navigator.userAgent
    // O iPad em modo "computador" se apresenta como Mac — mas Mac não tem tela de toque.
    const ios =
      /iPhone|iPad|iPod/.test(agente) || (/Macintosh/.test(agente) && navigator.maxTouchPoints > 1)
    if (!ios) return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (meta && !meta.content.includes("maximum-scale")) meta.content += ", maximum-scale=1"
  }, [])
  return null
}
