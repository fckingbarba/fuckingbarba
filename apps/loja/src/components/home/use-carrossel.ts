"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Os controles de um trilho que rola na horizontal.
 *
 * O trilho já rola no arraste, no toque e no teclado sem JavaScript nenhum —
 * é `overflow-x` com scroll-snap no CSS. Este hook só acrescenta o que não dá
 * pra fazer em CSS: as setas, o estado delas e a barra de progresso. Se o
 * script não carregar, a seção continua inteira; só fica sem botão.
 *
 * Duas regras que vieram do protótipo e valem manter:
 *
 * 1. **Anda de card em card, nunca para em meio card.** O passo é a largura
 *    de um item (com o vão) vezes quantos cabem na tela.
 * 2. **Se tudo já cabe, os controles somem.** Seta desabilitada ocupando
 *    espaço é pior que seta nenhuma — sugere que há mais coisa e não há.
 *
 * O nome fica em inglês, fora do padrão do resto do projeto, porque o
 * prefixo `use` não é prosa: é contrato do React. O linter e o devtools
 * identificam hook por ele, e `usarCarrossel` faz a regra dos hooks passar
 * batido — justamente a que pega hook chamado dentro de condição.
 */
export function useCarrossel() {
  const trilho = useRef<HTMLDivElement>(null)
  const [rola, setRola] = useState(false)
  const [noInicio, setNoInicio] = useState(true)
  const [noFim, setNoFim] = useState(false)
  const [barra, setBarra] = useState({ largura: 0, deslocamento: 0 })

  const sincronizar = useCallback(() => {
    const el = trilho.current
    if (!el) return
    const sobra = el.scrollWidth - el.clientWidth
    const podeRolar = sobra > 2
    setRola(podeRolar)
    if (!podeRolar) return
    setNoInicio(el.scrollLeft <= 2)
    setNoFim(el.scrollLeft >= sobra - 2)
    const fatia = (el.clientWidth / el.scrollWidth) * 100
    setBarra({ largura: fatia, deslocamento: (el.scrollLeft / sobra) * (100 - fatia) })
  }, [])

  useEffect(() => {
    const el = trilho.current
    if (!el) return
    sincronizar()
    el.addEventListener("scroll", sincronizar, { passive: true })
    // Largura de card muda com a janela, e com ela o passo e a barra.
    const observador = new ResizeObserver(sincronizar)
    observador.observe(el)
    return () => {
      el.removeEventListener("scroll", sincronizar)
      observador.disconnect()
    }
  }, [sincronizar])

  const andar = useCallback((sentido: 1 | -1) => {
    const el = trilho.current
    if (!el) return
    const primeiro = el.firstElementChild
    const vao = parseFloat(getComputedStyle(el).columnGap) || 0
    const largura = primeiro ? primeiro.getBoundingClientRect().width + vao : el.clientWidth
    const cabem = Math.max(1, Math.floor(el.clientWidth / largura))
    el.scrollBy({ left: sentido * largura * cabem, behavior: "smooth" })
  }, [])

  return { trilho, rola, noInicio, noFim, barra, andar }
}
