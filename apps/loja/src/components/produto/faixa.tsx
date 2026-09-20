import Image from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { Realce } from "@/components/realce"
import { conteudoDaPdp } from "@/conteudo/produto"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * FAIXA — a seção que é foto.
 *
 * Mesmo desenho do fechamento da home: a foto é fundo, o texto vem por cima
 * numa caixa escura, e a fita zebrada corta o topo. Ela existe pra dar
 * respiro entre dois blocos densos (o calendário e a rotina) sem a página
 * perder o fio.
 *
 * A FOTO SAI DO CATÁLOGO, pelo handle que o conteúdo aponta. Sem a foto a
 * seção ainda se sustenta — o fundo escuro assume e o texto continua
 * legível. É o oposto de ficar com um retângulo vazio esperando arquivo.
 *
 * O `alt` é vazio de propósito: a foto aqui é decoração, e todo o conteúdo
 * está no texto ao lado. Descrever uma foto de ambiente pro leitor de tela
 * só atrapalha quem está tentando ler a chamada.
 */
export async function Faixa({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).faixa
  if (!c) return null

  const produto = await buscarProdutoPorHandle(c.fotoDe)
  const foto = produto?.images?.[0]?.url ?? produto?.thumbnail ?? null

  return (
    <section className="faixa" aria-labelledby="faixa-titulo">
      {foto ? (
        <div className="faixa__foto">
          <Image src={foto} alt="" width={1600} height={900} loading="lazy" />
        </div>
      ) : null}

      <span className="faixa__tape" aria-hidden="true" />

      <div className="faixa__wrap">
        <p className="faixa__chapeu">
          <Raio />
          {c.chapeu}
        </p>

        <h2 className="faixa__titulo" id="faixa-titulo">
          <Realce texto={c.titulo} como="em" />
        </h2>

        <p className="faixa__texto">{c.texto}</p>

        {/*
          Sobe pra dobra em vez de abrir a sacola: o cliente ainda não
          escolheu quantos frascos quer. Botão que adiciona daqui pularia o
          degrau de quantidade — que é justamente a parte que mais rende.
        */}
        <Link href="#produto-nome" className="btn faixa__cta">
          {c.chamada}
          <Raio className="btn__bolt" />
        </Link>
      </div>
    </section>
  )
}
