"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { Raio } from "@/components/icones"
import type { VideoDaPdp } from "@/conteudo/produto"

/**
 * VÊ NA PRÁTICA — os vídeos do produto numa faixa própria, no fim da coluna
 * de compra, e não no meio da galeria de fotos (pedido da loja em 24/09: a
 * galeria é do produto; o vídeo é um mostruário à parte).
 *
 * O desenho é o do protótipo (`section.videos` em
 * `ferramentas/porte/prototipo-pdp.html`), e o CSS já vem no `pdp.css`: cada
 * cartão em pé, com a capa, o play, o nome e a duração. O clique ABRE o vídeo
 * numa janela (`<dialog>`), com os controles do navegador e COM SOM — quem
 * clicou quer ver, e o som é boa parte do "como aplicar". Diferente do vídeo
 * da galeria de antes, nada toca sozinho aqui.
 *
 * A janela fecha pelo X, pelo Esc (o `<dialog>` faz sozinho) ou clicando
 * fora do vídeo. Fechada, o vídeo para e larga o arquivo, e o foco volta pro
 * cartão que abriu — quem navega por teclado continua de onde estava.
 *
 * Sem vídeo, a seção não aparece: faixa de "em breve" não vende nada.
 */
export function VeNaPratica({
  videos,
  produto,
}: {
  videos: readonly VideoDaPdp[]
  /** O nome do produto, pro rótulo da janela quando o vídeo não tem nome. */
  produto: string
}) {
  const tela = useRef<HTMLDialogElement>(null)
  const player = useRef<HTMLVideoElement>(null)
  const quemAbriu = useRef<HTMLButtonElement | null>(null)
  const [aberto, setAberto] = useState<VideoDaPdp | null>(null)

  if (!videos.length) return null

  function abrir(video: VideoDaPdp, botao: HTMLButtonElement) {
    quemAbriu.current = botao
    setAberto(video)
    tela.current?.showModal()
    const v = player.current
    if (!v) return
    v.poster = video.poster
    v.src = video.url
    // Tocar pode ser recusado (economia de dados, bateria): aí fica a capa e o play.
    void v.play().catch(() => undefined)
  }

  function aoFechar() {
    const v = player.current
    if (v) {
      v.pause()
      v.removeAttribute("src")
      v.load()
    }
    setAberto(null)
    quemAbriu.current?.focus()
  }

  return (
    <section className="videos" aria-labelledby="videos-titulo">
      <h2 className="videos__titulo" id="videos-titulo">
        <Raio />
        Vê na prática
      </h2>

      <ul className="videos__fita">
        {videos.map((v, i) => {
          const tempo = duracao(v.duracao)
          return (
            <li key={v.url}>
              <button
                type="button"
                className="videos__item"
                aria-label={`Ver vídeo: ${v.titulo ?? `vídeo ${i + 1}`} (${tempo})`}
                onClick={(e) => abrir(v, e.currentTarget)}
              >
                <Image src={v.poster} alt="" width={180} height={320} sizes="96px" />
                <span className="videos__play" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 3.5 20 12 6 20.5z" />
                  </svg>
                </span>
                <span className="videos__rotulo">
                  {v.titulo ?? null}
                  <b>{tempo}</b>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Clique no fundo escuro (fora do vídeo) cai no próprio <dialog>: fecha. */}
      <dialog
        ref={tela}
        className="videos__tela"
        aria-label={aberto?.titulo ? `Vídeo: ${aberto.titulo}` : `Vídeo: ${produto}`}
        onClose={aoFechar}
        onClick={(e) => {
          if (e.target === e.currentTarget) tela.current?.close()
        }}
      >
        <button
          type="button"
          className="galeria__zoom-fecha"
          aria-label="Fechar o vídeo"
          onClick={() => tela.current?.close()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5.2 3.6 12 10.4l6.8-6.8 1.6 1.6L13.6 12l6.8 6.8-1.6 1.6L12 13.6l-6.8 6.8-1.6-1.6L10.4 12 3.6 5.2z" />
          </svg>
        </button>
        <video ref={player} controls playsInline preload="none" />
      </dialog>
    </section>
  )
}

/** 38 → "0:38"; 75,4 → "1:15". */
function duracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
