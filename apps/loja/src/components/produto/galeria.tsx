"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Fechar, Lupa } from "@/components/icones"

/**
 * A GALERIA DA DOBRA
 *
 * Miniatura troca a foto grande; a foto grande abre o zoom. Quantas fotos o
 * produto tiver — o componente lê a lista, não um número fixo.
 *
 * O ZOOM É <dialog>, e isso não é preciosismo: o elemento nativo prende o
 * foco dentro dele, fecha no Esc e devolve o foco pro botão que abriu,
 * sozinho. A mesma coisa feita à mão são umas oitenta linhas de gerência de
 * foco que quase sempre têm um buraco — e o buraco só aparece pra quem
 * navega por teclado, que é justamente quem não vai reclamar.
 *
 * COM UMA FOTO SÓ a tira de miniaturas some: uma miniatura sozinha não é
 * escolha, é enfeite que ocupa 64px da primeira tela do celular.
 */

export type Foto = { url: string; alt: string }

export function Galeria({
  fotos,
  alvo,
  desconto,
}: {
  fotos: readonly Foto[]
  /** Texto alternativo de reserva, quando a foto não tem o seu. */
  alvo: string
  /** Só aparece quando há preço cheio maior que o atual. */
  desconto: number | null
}) {
  const [atual, setAtual] = useState(0)
  const zoom = useRef<HTMLDialogElement>(null)

  const foto = fotos[atual] ?? fotos[0]

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

  if (!foto) {
    return <div className="galeria" aria-hidden="true" />
  }

  return (
    <div className="galeria">
      <button
        type="button"
        className="galeria__palco"
        aria-label="Ampliar a foto do produto"
        onClick={() => zoom.current?.showModal()}
      >
        {desconto ? (
          <ul className="galeria__selos">
            <li className="galeria__selo galeria__selo--desconto">-{desconto}%</li>
          </ul>
        ) : null}

        <span className="galeria__lupa">
          <Lupa />
        </span>

        <Image
          key={foto.url}
          id="galeria-foto"
          itemProp="image"
          src={foto.url}
          alt={foto.alt || alvo}
          width={900}
          height={900}
          priority
          sizes="(min-width: 1000px) 620px, 100vw"
        />
      </button>

      {fotos.length > 1 ? (
        <ul className="galeria__miniaturas">
          {fotos.map((f, i) => (
            <li key={f.url}>
              <button
                type="button"
                className="galeria__mini"
                aria-current={i === atual ? true : undefined}
                aria-label={`Ver foto ${i + 1}: ${f.alt || alvo}`}
                onClick={() => setAtual(i)}
              >
                <Image src={f.url} alt="" width={150} height={150} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog className="galeria__zoom" ref={zoom} aria-label="Foto ampliada do produto">
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
          já tem a versão grande em cache de quando o palco a pediu.
        */}
        <Image
          src={foto.url}
          alt={`${alvo}, foto ampliada`}
          width={900}
          height={900}
          sizes="(min-width: 900px) 860px, 92vw"
        />
      </dialog>
    </div>
  )
}
