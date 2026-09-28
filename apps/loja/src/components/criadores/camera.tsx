"use client"

import Image, { type StaticImageData } from "next/image"
import { useEffect, useRef } from "react"
import { OFERTA } from "@/lib/criadores-visivel"
import fotoDoCorpo from "./fotos/corpo.jpg"
import fotoDoFecho from "./fotos/fecho.jpg"
import fotoDoGancho from "./fotos/gancho.jpg"

/**
 * O CELULAR GRAVANDO — o topo da página dos criadores mostra o que ela pede:
 * um vídeo em pé, com o gancho nos 3 primeiros segundos e o fim entre 25 e
 * 40. Um criativo de 38 s passa em ~10 s, e cada volta troca o gancho.
 *
 * O GANCHO ANDA DEVAGAR (2,6 s pros 3 primeiros segundos do vídeo), pra dar
 * tempo de ler; o resto corre. Quem pede menos movimento vê o quadro parado
 * no gancho, e a animação para quando o celular sai da tela.
 *
 * UMA FOTO PRA CADA MOMENTO, de um criador de verdade (com autorização e contrato):
 * o gancho é a barba coçando, o corpo mostra o shampoo, o fecho é a barba arrumada.
 * A frase fica embaixo, em cima da barra do tempo, pra não cobrir a barba. As fotos
 * moram em `fotos/` (em pé, 9:16; o canto com o botão do reprodutor foi cortado).
 *
 * A tela é mexida pelos `ref`s, não pelo estado: são 60 quadros por segundo,
 * e cada um refazendo o React seria bateria à toa.
 */

/** Os ganchos que combinam com a foto do gancho (a barba coçando) e a do corpo (o shampoo). */
const GANCHOS = ["Sua barba coça? Assiste isso.", "Para de lavar a barba com shampoo de cabelo."]

type Tipo = "gancho" | "corpo" | "fim"

const FOTOS: { tipo: Tipo; foto: StaticImageData }[] = [
  { tipo: "gancho", foto: fotoDoGancho },
  { tipo: "corpo", foto: fotoDoCorpo },
  { tipo: "fim", foto: fotoDoFecho },
]

/** [milissegundos de verdade, segundo do vídeo] — o gancho devagar, o resto rápido. */
const QUADROS: [number, number][] = [
  [0, 0],
  [2600, 3],
  [6400, 25],
  [8600, 38],
  [9600, 38],
]
const VOLTA_MS = QUADROS[QUADROS.length - 1][0]
const FIM = OFERTA.segundos.max
const GANCHO = 3

function segundoNo(ms: number): number {
  for (let i = 1; i < QUADROS.length; i++) {
    const [ma, sa] = QUADROS[i - 1]
    const [mb, sb] = QUADROS[i]
    if (ms <= mb) return sa + (sb - sa) * ((ms - ma) / (mb - ma))
  }
  return QUADROS[QUADROS.length - 1][1]
}

type Fase = { texto: string; tipo: Tipo; nome: string; dica: string }

function faseNo(s: number, volta: number): Fase {
  if (s < GANCHO)
    return { texto: GANCHOS[volta], tipo: "gancho", nome: "Gancho", dica: `0 a ${GANCHO} s` }
  if (s < OFERTA.segundos.min)
    return {
      // O que a embalagem do shampoo diz — a frase não promete nada que o produto não diga.
      texto: s < 14 ? "Shampoo feito pra barba" : "Limpa e refresca",
      tipo: "corpo",
      nome: "Corpo",
      dica: "mostra o produto",
    }
  return {
    texto: "Pede o seu no link",
    tipo: "fim",
    nome: "Fecho",
    dica: `entre ${OFERTA.segundos.min} e ${FIM} s`,
  }
}

export function Camera() {
  const figura = useRef<HTMLElement>(null)
  const tela = useRef<HTMLDivElement>(null)
  const tc = useRef<HTMLSpanElement>(null)
  const cabeca = useRef<HTMLSpanElement>(null)
  const legenda = useRef<HTMLParagraphElement>(null)
  const fase = useRef<HTMLElement>(null)
  const dica = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let volta = 0
    let inicio: number | null = null
    let ultimo = ""
    let pedido = 0

    function desenha(s: number) {
      if (tc.current) tc.current.textContent = `00:${String(Math.floor(s)).padStart(2, "0")}`
      if (cabeca.current) cabeca.current.style.left = `${(s / FIM) * 100}%`
      const f = faseNo(s, volta)
      if (f.texto === ultimo || !legenda.current) return
      ultimo = f.texto
      legenda.current.dataset.tipo = f.tipo
      if (tela.current) tela.current.dataset.fase = f.tipo
      legenda.current.firstElementChild!.textContent = f.texto
      if (fase.current) fase.current.textContent = f.nome
      if (dica.current) dica.current.textContent = f.dica
    }
    function quadro(agora: number) {
      if (inicio === null) inicio = agora
      let ms = agora - inicio
      if (ms >= VOLTA_MS) {
        inicio = agora
        ms = 0
        volta = (volta + 1) % GANCHOS.length
      }
      desenha(segundoNo(ms))
      pedido = requestAnimationFrame(quadro)
    }

    const olho = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(pedido)
      if (e?.isIntersecting) {
        inicio = null
        pedido = requestAnimationFrame(quadro)
      }
    })
    if (figura.current) olho.observe(figura.current)
    return () => {
      olho.disconnect()
      cancelAnimationFrame(pedido)
    }
  }, [])

  return (
    <figure className="criadores__camera" ref={figura}>
      <div className="criadores__celular">
        <div className="criadores__tela" aria-hidden="true" data-fase="gancho" ref={tela}>
          {FOTOS.map(({ tipo, foto }) => (
            <Image
              key={tipo}
              className="criadores__foto"
              data-fase={tipo}
              src={foto}
              alt=""
              fill
              sizes="(max-width: 860px) 78vw, 280px"
              // `eager` + `fetchPriority`, e não `priority` (descontinuado no Next 16): a do
              // gancho é o que aparece primeiro, do lado do título; as outras entram em segundos.
              loading="eager"
              fetchPriority={tipo === "gancho" ? "high" : "auto"}
            />
          ))}
          <div className="criadores__grade" />
          <div className="criadores__hud">
            <span className="criadores__pilula criadores__rec">
              <i />
              REC
            </span>
            <span className="criadores__pilula" ref={tc}>
              00:01
            </span>
            <span className="criadores__916">9:16</span>
          </div>
          <p className="criadores__legenda" data-tipo="gancho" ref={legenda}>
            <span>{GANCHOS[0]}</span>
          </p>
          <div className="criadores__tempo">
            <div className="criadores__fase">
              <b ref={fase}>Gancho</b>
              <span ref={dica}>0 a {GANCHO} s</span>
            </div>
            <div className="criadores__trilho">
              <span className="criadores__trilho-gancho" />
              <span className="criadores__trilho-janela" />
              <span className="criadores__cabeca" ref={cabeca} />
            </div>
            <div className="criadores__marcas">
              <span style={{ left: 0 }}>0</span>
              <span style={{ left: `${(GANCHO / FIM) * 100}%` }}>{GANCHO}s</span>
              <span style={{ left: `${(OFERTA.segundos.min / FIM) * 100}%` }}>
                {OFERTA.segundos.min}s
              </span>
              <span style={{ left: "100%" }}>{FIM}s</span>
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        <span className="sr-only">
          Exemplo de criativo sendo gravado no celular: vídeo em pé, de {OFERTA.segundos.min} a{" "}
          {FIM} segundos, com o gancho nos {GANCHO} primeiros segundos.
        </span>
        <ul className="criadores__notas" aria-hidden="true">
          <li>Vertical 9:16</li>
          <li>
            {OFERTA.segundos.min} a {FIM} s
          </li>
          <li>Gancho em {GANCHO} s</li>
        </ul>
      </figcaption>
    </figure>
  )
}
