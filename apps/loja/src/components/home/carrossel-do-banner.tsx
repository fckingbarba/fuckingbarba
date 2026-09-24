"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { SlideDoBanner, type SlidePronto } from "@/components/home/slides-do-banner"
import { useCarrossel } from "@/components/home/use-carrossel"
import { useMovimentoReduzido } from "@/lib/use-preferencia"

/**
 * O BANNER COM MAIS DE UM SLIDE — até 5, que passam sozinhos no tempo que o
 * painel escolheu (5, 7 ou 10 segundos; ou só quando a pessoa troca).
 *
 * O trilho é o de sempre dos carrosséis da loja (`useCarrossel`): rolagem
 * na horizontal com encaixe, então o dedo no celular, o arraste e o teclado
 * funcionam sem JavaScript nenhum. Isto aqui só acrescenta a troca sozinha,
 * as setas e as bolinhas — e decide QUANDO baixar a imagem de cada slide.
 *
 * As regras da troca sozinha são as do palco da Alta Performance:
 * - **para de vez** quando a pessoa mexe (toca, arrasta, aperta uma seta ou
 *   uma bolinha): quem assumiu o controle não quer a tela puxada de volta;
 * - **espera** enquanto o mouse está em cima ou o foco está dentro;
 * - **fora da tela não troca**, e quem pediu menos movimento no sistema não
 *   vê troca nenhuma — fica no primeiro, e navega pelas bolinhas.
 *
 * A IMAGEM DE CADA SLIDE BAIXA SÓ QUANDO ELE VAI APARECER. O primeiro é o
 * LCP da home e vem com o HTML; o próximo começa a baixar dois segundos
 * antes da troca, ou assim que a pessoa encosta no banner (o dedo pode
 * arrastar a qualquer momento).
 */
export function CarrosselDoBanner({
  slides,
  tempo,
}: {
  slides: SlidePronto[]
  /** Segundos entre uma troca e outra; 0 = só quando a pessoa troca. */
  tempo: number
}) {
  const { trilho, atual, irPara } = useCarrossel()
  const secao = useRef<HTMLElement>(null)
  const [montados, setMontados] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [mexeu, setMexeu] = useState(false)
  const [emCima, setEmCima] = useState(false)
  const [naTela, setNaTela] = useState(true)
  const movimentoReduzido = useMovimentoReduzido()

  const total = slides.length
  const proximo = (atual + 1) % total
  const parado = mexeu || movimentoReduzido || tempo === 0

  const montar = useCallback((...quais: number[]) => {
    setMontados((m) => (quais.every((i) => m.has(i)) ? m : new Set([...m, ...quais])))
  }, [])

  useEffect(() => {
    const el = secao.current
    if (!el) return
    const vigia = new IntersectionObserver(([e]) => setNaTela(Boolean(e?.isIntersecting)), {
      threshold: 0.2,
    })
    vigia.observe(el)
    return () => vigia.disconnect()
  }, [])

  // A troca sozinha: baixa o próximo dois segundos antes, e troca.
  useEffect(() => {
    if (parado || emCima || !naTela) return
    const ms = tempo * 1000
    const antes = setTimeout(() => montar(proximo), Math.max(0, ms - 2000))
    const troca = setTimeout(() => {
      if (document.visibilityState === "visible") irPara(proximo)
    }, ms)
    return () => {
      clearTimeout(antes)
      clearTimeout(troca)
    }
  }, [atual, proximo, parado, emCima, naTela, tempo, montar, irPara])

  /** A pessoa assumiu: para de trocar sozinho, e os vizinhos já baixam. */
  const assumir = () => {
    setMexeu(true)
    montar((atual + total - 1) % total, proximo)
  }

  const ir = (i: number) => {
    assumir()
    montar(i)
    irPara(i)
  }

  return (
    <section
      ref={secao}
      className="banner-carrossel"
      aria-roledescription="carrossel"
      aria-label="Destaques"
      data-parado={parado ? "" : undefined}
      style={{ "--passo": `${tempo * 1000}ms` } as CSSProperties}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setEmCima(true)
        montar(proximo)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setEmCima(false)
      }}
      onFocus={() => setEmCima(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEmCima(false)
      }}
    >
      <div
        ref={trilho}
        className="banner-carrossel__trilho"
        onPointerDown={assumir}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) assumir()
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="banner-carrossel__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${total}: ${slide.titulo}`}
            // Slide escondido sai da ordem do Tab e do leitor de tela: sem isso
            // o foco cai num link que não está à vista.
            inert={i !== atual}
          >
            <SlideDoBanner
              slide={slide}
              primeiro={i === 0}
              // O que está na tela sempre tem a imagem (chegou nele arrastando, por exemplo).
              comImagem={i === atual || montados.has(i)}
              raiz="div"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="banner-carrossel__seta banner-carrossel__seta--antes"
        aria-label="Slide anterior"
        onClick={() => ir((atual + total - 1) % total)}
      >
        <Seta />
      </button>
      <button
        type="button"
        className="banner-carrossel__seta banner-carrossel__seta--depois"
        aria-label="Próximo slide"
        onClick={() => ir(proximo)}
      >
        <Seta />
      </button>

      <div className="banner-carrossel__pontos" role="group" aria-label="Escolher slide">
        {slides.map((slide, i) => (
          <button
            key={i}
            type="button"
            className="banner-carrossel__ponto"
            aria-label={`Ir pro slide ${i + 1}: ${slide.titulo}`}
            aria-current={i === atual ? "true" : undefined}
            onClick={() => ir(i)}
          >
            {/* A barrinha enche no compasso da troca; a `key` que muda reinicia a animação. */}
            <span
              className="banner-carrossel__ponto-barra"
              aria-hidden="true"
              key={`${i}-${atual}`}
            />
          </button>
        ))}
      </div>

      {/* Só anuncia a troca que a pessoa pediu: a sozinha, a cada 7 segundos, viraria falatório. */}
      <p className="sr-only" aria-live={mexeu ? "polite" : "off"}>
        {`Slide ${atual + 1} de ${total}: ${slides[atual]?.titulo ?? ""}`}
      </p>
    </section>
  )
}

function Seta() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8.6 3.6 7 5.2 13.8 12 7 18.8l1.6 1.6L17 12z" />
    </svg>
  )
}
