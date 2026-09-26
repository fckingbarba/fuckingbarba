"use client"

import { useEffect, useEffectEvent, useRef, useSyncExternalStore, type RefObject } from "react"

/**
 * A BARRINHA QUE É O RELÓGIO — dos carrosséis da home que passam sozinhos:
 * o banner e o palco da Alta Performance. A bolinha da vez tem uma barrinha
 * que enche no tempo do slide, e o slide troca quando ELA termina de encher.
 * A barra é uma animação do navegador (`Element.animate`), e não uma do CSS
 * com um `setTimeout` do lado.
 *
 * Por quê (26/09): eram dois relógios. A barra do CSS começava a encher já no
 * HTML do servidor, antes de o JavaScript chegar e a contagem da troca
 * começar — no celular, segundos antes; no palco, lá embaixo da página, ela
 * já estava cheia quando a pessoa chegava nele. E o que segurava a troca (o
 * mouse em cima, a seção fora da tela) não segurava a barra. A pessoa via a
 * barra cheia e o slide parado.
 *
 * - `barra`: a parte que enche, na bolinha da vez — o `ref` muda de bolinha
 *   junto com o slide;
 * - `vez`: o slide da vez; mudou, a contagem recomeça do zero;
 * - `parado`: sem contagem nenhuma (a pessoa escolheu, ou pediu menos
 *   movimento) — o CSS deixa a da vez cheia;
 * - `andando`: dá pra ver, e ninguém está em cima. Falso, a barra espera onde
 *   está e continua de onde parou. A aba escondida já conta aqui dentro;
 * - `aoEncher`: a troca;
 * - `quase`: o que fazer `antes` milissegundos de a barra encher (o banner
 *   baixa a arte do próximo slide).
 */
export function useBarraRelogio({
  barra,
  vez,
  ms,
  parado,
  andando,
  aoEncher,
  quase,
}: {
  barra: RefObject<HTMLElement | null>
  vez: number
  ms: number
  parado: boolean
  andando: boolean
  aoEncher: () => void
  quase?: { antes: number; fazer: () => void }
}) {
  const abaAVista = useAbaAVista()
  const anda = andando && abaAVista
  const contagem = useRef<Animation | null>(null)
  const encheu = useEffectEvent(aoEncher)
  const quaseLa = useEffectEvent(() => quase?.fazer())
  const antes = quase?.antes

  // A barra do slide da vez: nasce parada — quem manda andar é o efeito de baixo.
  useEffect(() => {
    const el = barra.current
    if (parado || !el || typeof el.animate !== "function") return
    const enche = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: ms,
      fill: "forwards",
    })
    enche.pause()
    contagem.current = enche
    enche.finished.then(
      () => encheu(),
      // Cancelada: o slide mudou, ou a pessoa assumiu.
      () => {}
    )
    return () => {
      contagem.current = null
      enche.cancel()
    }
  }, [barra, vez, ms, parado])

  // Anda só quando dá pra ver; parada, fica onde está.
  useEffect(() => {
    const enche = contagem.current
    if (!enche || enche.playState === "finished") return
    if (!anda) {
      enche.pause()
      return
    }
    enche.play()
    if (antes === undefined) return
    const andou = typeof enche.currentTime === "number" ? enche.currentTime : 0
    const quando = setTimeout(() => quaseLa(), Math.max(0, ms - antes - andou))
    return () => clearTimeout(quando)
  }, [anda, vez, ms, parado, antes])
}

/** A aba à vista: escondida, a barra (e a troca) espera. */
function useAbaAVista(): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      document.addEventListener("visibilitychange", aoMudar)
      return () => document.removeEventListener("visibilitychange", aoMudar)
    },
    () => document.visibilityState === "visible",
    () => true
  )
}
