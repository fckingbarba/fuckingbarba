"use client"

import Image, { getImageProps } from "next/image"
import {
  type KeyboardEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Fechar, Lupa, SetaDireita, SetaEsquerda, Tocar } from "@/components/icones"
import { duracaoCurta, VideoDoProduto } from "@/components/produto/video"
import type { VideoDaPdp } from "@/conteudo/produto"

/**
 * A GALERIA DA DOBRA
 *
 * Miniatura troca a foto grande; a foto grande abre o zoom. Quantas fotos o
 * produto tiver — o componente lê a lista, não um número fixo.
 *
 * A FOTO GRANDE PASSA NO DEDO (pedido da loja em 26/09 — no celular, só os
 * pontos embaixo dela trocavam a foto): o palco é um trilho com encaixe,
 * como o do banner da home. A foto acompanha o dedo e para inteira na
 * próxima, sem JavaScript nenhum; a miniatura (o ponto, no celular) e as
 * setas do teclado rolam o trilho até a foto. A foto da vez é a que está à
 * vista: é ela que o toque amplia e que a miniatura marca.
 *
 * SÓ A PRIMEIRA FOTO VEM NO HTML — é o LCP da página. A segunda entra quando
 * a página termina de carregar, e as vizinhas da vez quando a pessoa encosta
 * no palco ou chega numa foto: baixar todas junto com a primeira seria
 * dividir a banda com ela.
 *
 * O ZOOM É <dialog>, e isso não é preciosismo: o elemento nativo prende o
 * foco dentro dele, fecha no Esc e devolve o foco pro botão que abriu,
 * sozinho. A mesma coisa feita à mão são umas oitenta linhas de gerência de
 * foco que quase sempre têm um buraco — e o buraco só aparece pra quem
 * navega por teclado, que é justamente quem não vai reclamar.
 *
 * NO ZOOM AS FOTOS PASSAM (pedido da loja em 24/09 — antes ele mostrava uma
 * só, e pra ver outra era fechar e abrir de novo): setas dos lados, ← e → do
 * teclado e o dedo arrastando de lado no celular. Depois da última vem a
 * primeira. Fechando, a foto grande da página é a última vista no zoom. As
 * vizinhas da foto aberta são baixadas antes, e a troca não espera a rede.
 *
 * COM UMA FOTO SÓ a tira de miniaturas some — uma miniatura sozinha não é
 * escolha, é enfeite que ocupa 64px da primeira tela do celular — e o zoom
 * fica sem setas.
 *
 * OS VÍDEOS saíram daqui em 24/09 pro "Vê na prática" (`ve-na-pratica.tsx`):
 * a dobra só manda fotos. O tipo ainda aceita vídeo — toca no palco, mudo e
 * em loop (`VideoDoProduto`) —, mas o zoom passa só pelas fotos: vídeo não
 * amplia.
 */

export type Foto = { url: string; alt: string }
export type ItemDaGaleria = ({ tipo: "foto" } & Foto) | ({ tipo: "video" } & VideoDaPdp)

/** O `sizes` da foto ampliada: o mesmo na tela e no download antecipado das vizinhas. */
const TAMANHOS_DO_ZOOM = "(min-width: 900px) 860px, 92vw"
/** Quanto o dedo anda de lado (px) pra trocar a foto do zoom. */
const ARRASTO_MINIMO = 50

export function Galeria({
  itens,
  alvo,
  desconto,
}: {
  itens: readonly ItemDaGaleria[]
  /** Texto alternativo de reserva, quando a foto não tem o seu. */
  alvo: string
  /** Só aparece quando há preço cheio maior que o atual. */
  desconto: number | null
}) {
  /** A foto à vista no palco (posição em `itens`). Quem manda nela é a rolagem do trilho. */
  const [atual, setAtual] = useState(0)
  const trilho = useRef<HTMLDivElement>(null)
  // Quais fotos do palco já têm a imagem: a primeira vem no HTML.
  const [montados, setMontados] = useState<ReadonlySet<number>>(() => new Set([0]))
  // A seta do teclado passou a foto: o foco vai junto pra que entrou.
  const focarNaVez = useRef(false)
  const zoom = useRef<HTMLDialogElement>(null)
  // Onde o dedo encostou no zoom; `null` quando não é arrasto de um dedo só.
  const toque = useRef<{ x: number; y: number } | null>(null)

  // As fotos, cada uma com a posição dela em `itens`: o zoom passa só por elas.
  const fotos = useMemo(
    () => itens.flatMap((f, i) => (f.tipo === "foto" ? [{ ...f, i }] : [])),
    [itens]
  )
  // Qual foto o zoom mostra (posição em `fotos`), e se ele está aberto.
  const [noZoom, setNoZoom] = useState(0)
  const [aberto, setAberto] = useState(false)

  const total = itens.length
  const foto = fotos[noZoom] ?? fotos[0]

  const montar = useCallback(
    (...quais: number[]) => {
      setMontados((m) => {
        const novos = quais.filter((i) => i >= 0 && i < total && !m.has(i))
        return novos.length ? new Set([...m, ...novos]) : m
      })
    },
    [total]
  )

  /*
   * `showModal()` não existe como atributo, só como método — então abrir
   * pelo estado exigiria um efeito de qualquer jeito. Abrir no clique é mais
   * direto, e o <dialog> se vira com o resto.
   */
  useEffect(() => {
    const el = zoom.current
    if (!el) return
    const fecha = (e: MouseEvent) => {
      // clique no backdrop: o alvo é o próprio <dialog>, não o conteúdo
      if (e.target === el) el.close()
    }
    el.addEventListener("click", fecha)
    return () => el.removeEventListener("click", fecha)
  }, [])

  // O trilho rolou (o dedo, a miniatura, o teclado): a foto da vez é a que ficou à vista, e a
  // anterior e a próxima dela já vêm baixando — o próximo arrasto não acha o vazio.
  useEffect(() => {
    const el = trilho.current
    if (!el || total < 2) return
    const ver = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      const vez = Math.min(total - 1, Math.max(0, i))
      setAtual(vez)
      montar(vez - 1, vez, vez + 1)
    }
    el.addEventListener("scroll", ver, { passive: true })
    // O dedo pode ter arrastado antes do JavaScript chegar: a vez começa de onde o trilho está.
    // (Na primeira foto não: aí a segunda espera a página carregar, logo abaixo.)
    const quadro = requestAnimationFrame(() => {
      if (el.scrollLeft > 0) ver()
    })
    return () => {
      el.removeEventListener("scroll", ver)
      cancelAnimationFrame(quadro)
    }
  }, [total, montar])

  // A segunda foto entra quando a página termina de carregar: antes, dividiria a banda com a primeira.
  useEffect(() => {
    if (total < 2) return
    let espera: number | undefined
    const depois = () => {
      espera = window.setTimeout(() => montar(1), 300)
    }
    if (document.readyState === "complete") depois()
    else window.addEventListener("load", depois, { once: true })
    return () => {
      window.removeEventListener("load", depois)
      window.clearTimeout(espera)
    }
  }, [total, montar])

  // Depois da seta do teclado, o foco segue a foto que entrou: a que saiu de vista fica inerte.
  useLayoutEffect(() => {
    if (!focarNaVez.current) return
    focarNaVez.current = false
    trilho.current?.children[atual]?.querySelector("button")?.focus({ preventScroll: true })
  }, [atual])

  // Com o zoom aberto, a anterior e a próxima já vêm baixando: a troca é na hora.
  useEffect(() => {
    if (!aberto || fotos.length < 2) return
    const n = fotos.length
    for (const vizinha of new Set([(noZoom + 1) % n, (noZoom - 1 + n) % n])) {
      const { props } = getImageProps({
        src: fotos[vizinha].url,
        alt: "",
        width: 900,
        height: 900,
        sizes: TAMANHOS_DO_ZOOM,
      })
      const img = new window.Image()
      img.sizes = props.sizes ?? ""
      img.srcset = props.srcSet ?? ""
      img.src = props.src
    }
  }, [aberto, noZoom, fotos])

  if (!total) {
    return <div className="galeria" aria-hidden="true" />
  }

  /** Rola o palco até a foto `i`: suave na miniatura e no teclado; na hora, fechando o zoom. */
  function irPara(i: number, naHora = false) {
    const el = trilho.current
    const alvoDaRolagem = el?.children[i]
    if (!el || !alvoDaRolagem) return
    montar(i)
    const left =
      el.scrollLeft + alvoDaRolagem.getBoundingClientRect().left - el.getBoundingClientRect().left
    if (!naHora) return el.scrollTo({ left })
    // Na hora: o `scroll-behavior: smooth` do CSS sai só pra este pulo.
    el.style.scrollBehavior = "auto"
    el.scrollLeft = left
    el.style.scrollBehavior = ""
  }

  function aoTeclarNoPalco(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!passo) return
    // Sem isto a seta rola o trilho uns pixels, o encaixe leva pra outra foto e o foco se perde.
    e.preventDefault()
    const i = atual + passo
    if (i < 0 || i >= total) return
    focarNaVez.current = true
    irPara(i)
  }

  function abrirZoom() {
    const naFoto = fotos.findIndex((f) => f.i === atual)
    setNoZoom(Math.max(0, naFoto))
    setAberto(true)
    zoom.current?.showModal()
  }

  function passar(passo: 1 | -1) {
    if (fotos.length < 2) return
    setNoZoom((n) => (n + passo + fotos.length) % fotos.length)
  }

  function aoFechar() {
    setAberto(false)
    // A foto grande da página fica na última vista no zoom.
    const vista = fotos[noZoom]
    if (vista && vista.i !== atual) {
      setAtual(vista.i)
      irPara(vista.i, true)
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "ArrowRight") passar(1)
    else if (e.key === "ArrowLeft") passar(-1)
    else return
    e.preventDefault()
  }

  function aoEncostar(e: TouchEvent<HTMLDialogElement>) {
    // Dois dedos é pinça (o zoom do próprio celular), não troca de foto.
    const t = e.touches[0]
    toque.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
  }

  function aoSoltar(e: TouchEvent<HTMLDialogElement>) {
    const inicio = toque.current
    toque.current = null
    const fim = e.changedTouches[0]
    if (!inicio || !fim || e.touches.length > 0) return
    // Com a tela ampliada pela pinça, arrastar é passear pela foto, não trocar.
    if ((window.visualViewport?.scale ?? 1) > 1.05) return
    const dx = fim.clientX - inicio.x
    const dy = fim.clientY - inicio.y
    if (Math.abs(dx) >= ARRASTO_MINIMO && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      passar(dx < 0 ? 1 : -1)
    }
  }

  return (
    <div className="galeria">
      <div className="galeria__palco">
        {/*
          `aria-hidden`: o desconto já é dito no preço, do lado — aqui ele é
          só desenho. (Quando o selo morava dentro do botão da foto, um
          "-31%" visível fora do nome do botão era o que o Lighthouse
          reprovava: quem usa voz pra comandar a tela diz o que vê.)
        */}
        {desconto ? (
          <ul className="galeria__selos" aria-hidden="true">
            <li className="galeria__selo galeria__selo--desconto">-{desconto}%</li>
          </ul>
        ) : null}

        <span className="galeria__lupa" aria-hidden="true">
          <Lupa />
        </span>

        <div
          ref={trilho}
          className="galeria__trilho"
          // Encostou: a anterior e a próxima já vêm baixando (o dedo pode arrastar a qualquer momento).
          onPointerDown={() => montar(atual - 1, atual + 1)}
          onKeyDown={aoTeclarNoPalco}
        >
          {itens.map((f, i) => (
            <div
              key={f.url}
              className={
                f.tipo === "video" ? "galeria__slide galeria__slide--video" : "galeria__slide"
              }
              // A foto fora de vista sai da ordem do Tab e do leitor de tela: sem isso
              // o foco cai numa foto que não está à vista.
              inert={i !== atual}
            >
              {f.tipo === "video" ? (
                montados.has(i) ? (
                  <VideoDoProduto video={f} rotulo={`Vídeo: ${alvo}`} enquadrar="contain" />
                ) : (
                  <div className="video video--contain" />
                )
              ) : (
                <button
                  type="button"
                  className="galeria__foto"
                  aria-label={
                    total > 1 ? `Ampliar a foto ${i + 1} de ${total}` : "Ampliar a foto do produto"
                  }
                  onClick={abrirZoom}
                >
                  {montados.has(i) ? (
                    <Image
                      id={i === 0 ? "galeria-foto" : undefined}
                      itemProp={i === 0 ? "image" : undefined}
                      src={f.url}
                      alt={f.alt || alvo}
                      width={900}
                      height={900}
                      // `fetchPriority="high"` + `eager`, e não `priority`: no Next 16 o
                      // `priority` foi descontinuado e só punha um preload de prioridade
                      // BAIXA no <head> — a foto principal entrava na fila atrás dos
                      // scripts. A primeira é o LCP da página; as outras só são montadas
                      // quando é pra baixar (ver o topo), então também não esperam.
                      loading="eager"
                      fetchPriority={i === 0 ? "high" : undefined}
                      sizes="(min-width: 1000px) 620px, 100vw"
                    />
                  ) : null}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {total > 1 ? (
        <ul className="galeria__miniaturas">
          {itens.map((f, i) => (
            <li key={f.url}>
              {f.tipo === "video" ? (
                <button
                  type="button"
                  className="galeria__mini galeria__mini--video"
                  aria-current={i === atual ? true : undefined}
                  aria-label={`Ver o vídeo ${i + 1} (${duracaoCurta(f.duracao)}): ${alvo}`}
                  onClick={() => irPara(i)}
                >
                  <Image src={f.poster} alt="" width={150} height={150} loading="lazy" />
                  <span className="galeria__mini-play" aria-hidden="true">
                    <Tocar />
                    {duracaoCurta(f.duracao)}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="galeria__mini"
                  aria-current={i === atual ? true : undefined}
                  aria-label={`Ver foto ${i + 1}: ${f.alt || alvo}`}
                  onClick={() => irPara(i)}
                >
                  <Image src={f.url} alt="" width={150} height={150} loading="lazy" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        className="galeria__zoom"
        ref={zoom}
        aria-label="Foto ampliada do produto"
        onClose={aoFechar}
        onKeyDown={aoTeclar}
        onTouchStart={aoEncostar}
        onTouchEnd={aoSoltar}
      >
        <button
          type="button"
          className="galeria__zoom-fecha"
          aria-label="Fechar"
          onClick={() => zoom.current?.close()}
        >
          <Fechar />
        </button>
        {/*
          `unoptimized` não: a foto ampliada é a mesma URL, então o otimizador
          já tem a versão grande em cache de quando o palco a pediu. E sem
          `key`: trocando de foto, o <img> é o mesmo e o navegador segura a
          anterior na tela até a nova chegar — não pisca em branco.
        */}
        {foto ? (
          <Image
            src={foto.url}
            alt={`${foto.alt || alvo}, foto ampliada`}
            width={900}
            height={900}
            sizes={TAMANHOS_DO_ZOOM}
          />
        ) : null}
        {fotos.length > 1 ? (
          <>
            <button
              type="button"
              className="galeria__zoom-seta galeria__zoom-seta--antes"
              aria-label="Foto anterior"
              onClick={() => passar(-1)}
            >
              <SetaEsquerda />
            </button>
            <button
              type="button"
              className="galeria__zoom-seta galeria__zoom-seta--depois"
              aria-label="Próxima foto"
              onClick={() => passar(1)}
            >
              <SetaDireita />
            </button>
            <p className="galeria__zoom-conta" aria-live="polite">
              <span aria-hidden="true">
                {noZoom + 1} / {fotos.length}
              </span>
              <span className="sr-only">
                Foto {noZoom + 1} de {fotos.length}
              </span>
            </p>
          </>
        ) : null}
      </dialog>
    </div>
  )
}
