"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Raio } from "@/components/icones"
import { useBarraRelogio } from "@/components/home/use-barra-relogio"
import { useMovimentoReduzido } from "@/lib/use-preferencia"

/** Quanto tempo cada produto fica na tela. */
const PASSO = 5500
/** No celular os três cards empilham e a seção passa da altura da tela:
 *  rolar e ler leva mais tempo, então o passo ganha dois segundos. */
const PASSO_LONGO = PASSO + 2000

/**
 * O palco da seção "Alta Performance": troca de produto sozinho.
 *
 * Carrossel automático é das coisas que mais irritam quando feito sem
 * cuidado, então as regras aqui são todas sobre não atrapalhar:
 *
 * - **Para de girar assim que a pessoa escolhe um produto.** Quem assumiu o
 *   controle não quer a tela sendo puxada de volta no meio da leitura. Não
 *   volta a girar depois — essa é a diferença entre pausar e desistir.
 * - **Fora da tela não gira.** Enquanto ninguém está vendo, o movimento é
 *   bateria gasta à toa; e voltar pro slide 1 depois de três trocas
 *   invisíveis é pior que ficar parado.
 * - **Espera enquanto o mouse está em cima ou o foco está dentro** (26/09):
 *   quem está lendo o card, ou indo pro "Comprar", não quer o produto
 *   trocando debaixo do mouse. Saiu, continua de onde parou.
 * - **A barrinha é o relógio** (26/09): o produto troca quando ela enche
 *   (`useBarraRelogio`). Antes ela era do CSS e enchia desde o carregamento
 *   da página — chegava cheia aqui embaixo, e a troca vinha segundos depois.
 * - **Quem pediu menos movimento não vê movimento nenhum**
 *   (`prefers-reduced-motion`): fica no primeiro, e navega pelas bolinhas.
 * - **O slide escondido leva `inert`.** Some da ordem de tabulação e da
 *   árvore de acessibilidade de uma vez: sem isso o Tab entra num slide
 *   invisível e o foco desaparece da tela.
 *
 * Os slides chegam prontos do servidor como `children` — o que vira
 * JavaScript aqui é só a troca, não o conteúdo.
 */
export function PalcoAltaPerformance({
  rotulos,
  children,
}: {
  rotulos: string[]
  children: ReactNode
}) {
  const [atual, setAtual] = useState(0)
  const [escolheu, setEscolheu] = useState(false)
  const [passo, setPasso] = useState(PASSO)
  const [naTela, setNaTela] = useState(false)
  const [emCima, setEmCima] = useState(false)
  const secao = useRef<HTMLElement>(null)
  const trilho = useRef<HTMLDivElement>(null)
  /** A barrinha do produto da vez — a que enche. */
  const barra = useRef<HTMLSpanElement>(null)

  const total = rotulos.length
  // O hook vem antes do `||`: com o curto-circuito ele deixaria de ser
  // chamado quando a pessoa já tivesse escolhido, e hook que às vezes roda
  // e às vezes não é a maneira clássica de quebrar o React.
  const movimentoReduzido = useMovimentoReduzido()
  // Parado por escolha da pessoa ou por preferência do sistema — os dois
  // valem igual, e nenhum dos dois volta a girar sozinho.
  const parado = escolheu || movimentoReduzido

  useBarraRelogio({
    barra,
    vez: atual,
    ms: passo,
    parado,
    andando: naTela && !emCima,
    aoEncher: () => setAtual((i) => (i + 1) % total),
  })

  // `inert` é atributo de DOM e os slides já vieram renderizados do
  // servidor: mexer neles por ref é mais honesto que clonar elemento.
  useEffect(() => {
    const filhos = trilho.current?.children
    if (!filhos) return
    for (let i = 0; i < filhos.length; i++) {
      ;(filhos[i] as HTMLElement).inert = i !== atual
    }
  }, [atual])

  useEffect(() => {
    const el = secao.current
    if (!el) return

    const medirPasso = () => setPasso(el.offsetHeight > window.innerHeight ? PASSO_LONGO : PASSO)
    medirPasso()
    window.addEventListener("resize", medirPasso)

    const vigia = new IntersectionObserver(
      ([entrada]) => setNaTela(Boolean(entrada?.isIntersecting)),
      { threshold: 0.2 }
    )
    vigia.observe(el)

    return () => {
      vigia.disconnect()
      window.removeEventListener("resize", medirPasso)
    }
  }, [])

  function escolher(i: number) {
    setAtual(i)
    setEscolheu(true)
  }

  return (
    <section
      ref={secao}
      className="benefits"
      aria-labelledby="benefits-heading"
      aria-roledescription="carrossel"
      data-parado={parado ? "" : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setEmCima(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setEmCima(false)
      }}
      onFocus={() => setEmCima(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEmCima(false)
      }}
    >
      <div className="benefits__topo">
        <h2 id="benefits-heading" className="benefits__title">
          <Raio className="benefits__title-bolt" />
          Alta Performance
        </h2>
        <p className="benefits__etiqueta" aria-hidden="true">
          {rotulos[atual]}
        </p>
      </div>

      <div className="benefits__palco">
        <div
          ref={trilho}
          className="benefits__trilho"
          style={{ transform: `translate3d(${-100 * atual}%,0,0)` }}
        >
          {children}
        </div>
      </div>

      <div className="benefits__pontos" role="group" aria-label="Escolher produto">
        {rotulos.map((rotulo, i) => (
          <button
            key={rotulo}
            type="button"
            className="benefits__ponto"
            onClick={() => escolher(i)}
            aria-label={`Ver ${rotulo}`}
            aria-controls={`perf-slide-${i}`}
            aria-current={i === atual ? "true" : undefined}
          >
            <span className="benefits__ponto-barra" aria-hidden="true">
              <span className="benefits__ponto-cheia" ref={i === atual ? barra : undefined} />
            </span>
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {rotulos[atual]} — {atual + 1} de {total}
      </p>
    </section>
  )
}
