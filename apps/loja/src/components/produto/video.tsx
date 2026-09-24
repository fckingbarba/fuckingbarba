"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Pausar, SomDesligado, SomLigado, Tocar } from "@/components/icones"
import type { VideoDaPdp } from "@/conteudo/produto"

/**
 * UM VÍDEO DA PÁGINA DO PRODUTO — o da galeria da dobra e o do modo de uso.
 *
 * O mesmo jeito do vídeo da home (`components/home/video-da-marca.tsx`):
 * mudo, em loop e só quando está na tela — mudo porque é a única forma de o
 * navegador deixar tocar sozinho, e só na tela porque ele nem baixa antes
 * (`preload="none"`). Até tocar, a capa (o primeiro quadro, que subiu junto
 * com ele). O espaço já está reservado pelas medidas: nada pula quando ele
 * chega.
 *
 * Os botões: pausar (vídeo que se mexe sozinho por mais de cinco segundos
 * precisa de um jeito de parar — WCAG 2.2.2) e ligar o som, que só aparece
 * quando o vídeo TEM som. Quem pediu menos movimento no sistema vê a capa e
 * o play.
 *
 * `enquadrar`: "cover" preenche a caixa e corta o que sobra (o modo de uso,
 * que é 16:9); "contain" mostra o vídeo inteiro, com faixa escura em volta
 * (o palco quadrado da galeria, que recebe vídeo em pé).
 */
export function VideoDoProduto({
  video,
  rotulo,
  enquadrar,
  className = "",
}: {
  video: VideoDaPdp
  rotulo: string
  enquadrar: "cover" | "contain"
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState(false)
  const [comSom, setComSom] = useState(false)
  const [temSom, setTemSom] = useState(false)
  /* Quem pausou foi a pessoa: rolar pra longe e voltar não despausa. */
  const pausouNaMao = useRef(false)

  useEffect(() => {
    const v = ref.current
    if (!v || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const olho = new IntersectionObserver(
      ([visto]) => {
        if (visto?.isIntersecting && !pausouNaMao.current) v.play().catch(() => {})
        else if (!visto?.isIntersecting) v.pause()
      },
      { threshold: 0.4 }
    )
    olho.observe(v)
    return () => olho.disconnect()
  }, [])

  function alternar() {
    const v = ref.current
    if (!v) return
    pausouNaMao.current = !v.paused
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  function alternarSom() {
    const v = ref.current
    if (!v) return
    // Direto no elemento: o `play()` logo abaixo precisa achar o som já ligado, no mesmo toque.
    v.muted = comSom
    setComSom(!comSom)
    if (!comSom && v.paused) {
      pausouNaMao.current = false
      v.play().catch(() => {})
    }
  }

  return (
    <div
      className={`video video--${enquadrar} ${className}`.trim()}
      style={{ "--proporcao": `${video.largura} / ${video.altura}` } as CSSProperties}
    >
      <video
        ref={ref}
        src={video.url}
        poster={video.poster}
        width={video.largura}
        height={video.altura}
        muted={!comSom}
        loop
        playsInline
        preload="none"
        aria-label={rotulo}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onTimeUpdate={(e) => {
          if (!temSom && e.currentTarget.currentTime > 0.3 && temAudio(e.currentTarget)) {
            setTemSom(true)
          }
        }}
      />
      <div className="video__controles">
        <button
          type="button"
          onClick={alternar}
          aria-label={tocando ? "Pausar o vídeo" : "Tocar o vídeo"}
        >
          {tocando ? <Pausar /> : <Tocar />}
        </button>
        {temSom ? (
          <button
            type="button"
            onClick={alternarSom}
            aria-pressed={comSom}
            aria-label={comSom ? "Desligar o som" : "Ligar o som"}
          >
            {comSom ? <SomLigado /> : <SomDesligado />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * O vídeo tem trilha de áudio? Cada navegador responde de um jeito, e
 * nenhum antes de o vídeo andar um pouco — por isso a pergunta mora no
 * `timeupdate` (o mesmo do vídeo da home).
 */
function temAudio(v: HTMLVideoElement): boolean {
  const x = v as HTMLVideoElement & {
    mozHasAudio?: boolean
    webkitAudioDecodedByteCount?: number
    audioTracks?: { length: number }
  }
  return (
    Boolean(x.mozHasAudio) ||
    (x.webkitAudioDecodedByteCount ?? 0) > 0 ||
    (x.audioTracks?.length ?? 0) > 0
  )
}

/** "0:12" — a duração no canto da miniatura. */
export function duracaoCurta(segundos: number): string {
  const s = Math.max(1, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
