"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SlideDoBanner, type SlidePronto } from "@/components/home/slides-do-banner"
import { useBarraRelogio } from "@/components/home/use-barra-relogio"
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
 *
 * A BARRINHA É O RELÓGIO DA TROCA (26/09): o slide troca quando ela termina
 * de encher, e o que segura a troca segura a barra — ver `useBarraRelogio`.
 *
 * AS BOLINHAS FICAM EMBAIXO DA ARTE, numa faixa escura (26/09): por cima,
 * cobriam o botão desenhado na arte do celular.
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
  /** A barrinha do slide da vez — a que enche. */
  const barra = useRef<HTMLSpanElement>(null)
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

  // A troca sozinha: a barrinha do slide enche no tempo escolhido e, cheia, troca.
  // O próximo slide começa a baixar dois segundos antes.
  useBarraRelogio({
    barra,
    vez: atual,
    ms: tempo * 1000,
    parado,
    andando: !emCima && naTela,
    aoEncher: () => irPara(proximo),
    quase: { antes: 2000, fazer: () => montar(proximo) },
  })

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
            <span className="banner-carrossel__ponto-barra" aria-hidden="true">
              <span
                className="banner-carrossel__ponto-cheia"
                ref={i === atual ? barra : undefined}
              />
            </span>
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
