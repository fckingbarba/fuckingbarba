"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Pausar, SomDesligado, SomLigado, Tocar } from "@/components/icones"
import type { VideoDaMarca as Video } from "@/lib/configuracoes"

/**
 * O VÍDEO DA HISTÓRIA DA MARCA — no lugar da foto, quando o admin subiu um
 * (Configurações da loja → Home).
 *
 * ┌─ COMO ELE SE COMPORTA, E POR QUÊ ──────────────────────────────────────┐
 * │ Mudo, em loop, e só quando está na tela. Mudo porque é a única forma   │
 * │ de um navegador deixar tocar sozinho (e som que começa sem pedir é o   │
 * │ jeito mais rápido de a pessoa fechar a aba). Só na tela porque ele     │
 * │ nem baixa antes (`preload="none"`): a seção fica no meio da home, e    │
 * │ quem não rola até ela não gasta o 4G com um vídeo que não viu.         │
 * │                                                                        │
 * │ Até começar, aparece a capa — a foto do produto que a seção sempre     │
 * │ mostrou. E o espaço já está reservado pelas medidas que o admin mediu  │
 * │ na hora de subir: nada pula quando o vídeo chega.                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Os botões: pausar (vídeo que se mexe sozinho por mais de cinco segundos
 * precisa de um jeito de parar — é regra de acessibilidade, a WCAG 2.2.2) e
 * ligar o som, que só aparece quando o vídeo TEM som. Quem pediu menos
 * movimento no sistema não recebe vídeo andando sozinho: vê a capa e o
 * play.
 */
export function VideoDaMarca({
  video,
  capa,
  titulo,
}: {
  video: Video
  /** A foto do produto — a capa, até o vídeo começar. */
  capa: string | null
  titulo: string
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
    // Direto no elemento, e não só pelo estado: o `play()` logo abaixo
    // precisa encontrar o som já ligado, dentro do mesmo toque.
    v.muted = comSom
    setComSom(!comSom)
    if (!comSom && v.paused) {
      pausouNaMao.current = false
      v.play().catch(() => {})
    }
  }

  const deitado = video.largura > video.altura

  return (
    <div
      className={`sobre__midia sobre__midia--video sobre__midia--${deitado ? "deitado" : "em-pe"}`}
      style={{ "--proporcao": `${video.largura} / ${video.altura}` } as CSSProperties}
    >
      <video
        ref={ref}
        src={video.url}
        poster={capa ?? undefined}
        muted={!comSom}
        loop
        playsInline
        preload="none"
        aria-label={`Vídeo: ${titulo}`}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onTimeUpdate={(e) => {
          if (!temSom && e.currentTarget.currentTime > 0.3 && temAudio(e.currentTarget)) {
            setTemSom(true)
          }
        }}
      />
      <div className="sobre__controles">
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
 * O vídeo tem trilha de áudio? Cada navegador responde de um jeito: o
 * Firefox diz direto, o Safari lista as trilhas, e o Chrome conta o áudio
 * que já decodificou (mesmo no mudo). Nenhum dos três responde antes de o
 * vídeo andar um pouco — por isso a pergunta mora no `timeupdate`.
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
