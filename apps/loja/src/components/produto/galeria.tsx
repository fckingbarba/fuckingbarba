"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Fechar, Lupa, Tocar } from "@/components/icones"
import { duracaoCurta, VideoDoProduto } from "@/components/produto/video"
import type { VideoDaPdp } from "@/conteudo/produto"

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
 *
 * OS VÍDEOS (painel → Produtos → Fotos e vídeos) entram entre as fotos, na
 * ordem escolhida — nunca na capa, que é a foto que abre a página, vai pro
 * Google e é o LCP. A miniatura dele é a capa do vídeo com o play e a
 * duração; escolhido, ele toca no palco, mudo e em loop (`VideoDoProduto`),
 * e só então baixa.
 */

export type Foto = { url: string; alt: string }
export type ItemDaGaleria = ({ tipo: "foto" } & Foto) | ({ tipo: "video" } & VideoDaPdp)

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
  const [atual, setAtual] = useState(0)
  const zoom = useRef<HTMLDialogElement>(null)

  const item = itens[atual] ?? itens[0]
  // O zoom mostra a última FOTO vista: vídeo não amplia.
  const foto = item?.tipo === "foto" ? item : itens.find((i) => i.tipo === "foto")

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

  if (!item) {
    return <div className="galeria" aria-hidden="true" />
  }

  return (
    <div className="galeria">
      {item.tipo === "video" ? (
        <div className="galeria__palco galeria__palco--video">
          <VideoDoProduto
            key={item.url}
            video={item}
            rotulo={`Vídeo: ${alvo}`}
            enquadrar="contain"
          />
        </div>
      ) : (
        <button
          type="button"
          className="galeria__palco"
          aria-label="Ampliar a foto do produto"
          onClick={() => zoom.current?.showModal()}
        >
          {/*
          `aria-hidden`: o selo mora DENTRO do botão, e o que se lê em voz
          alta é o nome do botão ("Ampliar a foto do produto"). Um "-31%"
          visível fora desse nome é o que o Lighthouse reprova (quem usa voz
          pra comandar a tela diz o que vê, e o botão não atende). O desconto
          já é dito no preço, do lado — aqui ele é só desenho.
        */}
          {desconto ? (
            <ul className="galeria__selos" aria-hidden="true">
              <li className="galeria__selo galeria__selo--desconto">-{desconto}%</li>
            </ul>
          ) : null}

          <span className="galeria__lupa">
            <Lupa />
          </span>

          <Image
            key={item.url}
            id="galeria-foto"
            itemProp="image"
            src={item.url}
            alt={item.alt || alvo}
            width={900}
            height={900}
            // `fetchPriority="high"` + `eager`, e não `priority`: no Next 16 o
            // `priority` foi descontinuado e só punha um preload de prioridade
            // BAIXA no <head> — a foto principal entrava na fila atrás dos
            // scripts. É ela o LCP da página.
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1000px) 620px, 100vw"
          />
        </button>
      )}

      {itens.length > 1 ? (
        <ul className="galeria__miniaturas">
          {itens.map((f, i) => (
            <li key={f.url}>
              {f.tipo === "video" ? (
                <button
                  type="button"
                  className="galeria__mini galeria__mini--video"
                  aria-current={i === atual ? true : undefined}
                  aria-label={`Ver o vídeo ${i + 1} (${duracaoCurta(f.duracao)}): ${alvo}`}
                  onClick={() => setAtual(i)}
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
                  onClick={() => setAtual(i)}
                >
                  <Image src={f.url} alt="" width={150} height={150} loading="lazy" />
                </button>
              )}
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
        {foto ? (
          <Image
            src={foto.url}
            alt={`${alvo}, foto ampliada`}
            width={900}
            height={900}
            sizes="(min-width: 900px) 860px, 92vw"
          />
        ) : null}
      </dialog>
    </div>
  )
}
