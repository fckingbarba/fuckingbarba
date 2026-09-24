import Image from "next/image"
import Link from "next/link"
import { Fragment } from "react"
import { VideoDaMarca } from "@/components/home/video-da-marca"
import { Raio } from "@/components/icones"
import { buscarProdutoPorHandle, configuracoes, home } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * A história da marca.
 *
 * A foto sai do catálogo em vez de ser um arquivo à parte: é a mesma imagem
 * que o produto já usa, então não há uma segunda cópia pra manter atualizada
 * quando a embalagem mudar. Sem a foto, a seção continua — o texto é o que
 * ela veio dizer.
 *
 * COM VÍDEO, O VÍDEO MANDA. Ele sobe pelo painel ("Layout da home" → Sobre
 * a marca), vai pra home publicada junto do texto e entra no lugar da foto,
 * com a capa dele (um quadro do começo) até começar a tocar
 * (`video-da-marca.tsx`). O Medusa de antes da entrega 0080 não manda o
 * vídeo na home (`sobre.video` sem a chave): aí vale o que o admin subia em
 * Configurações da loja → Home, com a foto do produto de capa.
 *
 * ┌─ ENXUTA: TUDO AO LADO DA FOTO ─────────────────────────────────────────┐
 * │ Título, texto, números e o botão moram na coluna do lado da mídia, e   │
 * │ não em faixas empilhadas embaixo dela. A seção passou a ter a altura   │
 * │ da foto (ou do vídeo) em vez da soma de tudo. No celular, empilha:     │
 * │ título, mídia, texto.                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O texto, os números e de qual produto é a foto vêm do painel ("Layout da
 * home"), com o aviso de que os números precisam ser conferidos: ano de
 * fundação e clientes impactados são afirmações sobre o negócio, não
 * enfeite. A frase em destaque (o "grito") entra depois do primeiro
 * parágrafo.
 */
export async function Sobre() {
  const [{ conteudo }, configs] = await Promise.all([home(), configuracoes()])
  const sobre = conteudo.sobre
  const produto = sobre.fotoDe ? await buscarProdutoPorHandle(sobre.fotoDe) : null
  const capa = produto?.thumbnail ?? null
  const video = sobre.video !== undefined ? sobre.video : configs.home.video

  const midia = video ? (
    <VideoDaMarca video={video} capa={capa} titulo={sobre.titulo} />
  ) : capa ? (
    <div className="sobre__midia">
      <Image
        src={capa}
        alt={produto?.title ?? ""}
        width={600}
        height={600}
        loading="lazy"
        sizes="(max-width: 880px) 100vw, 480px"
      />
    </div>
  ) : null

  return (
    // `id="sobre"` é o destino do "Sobre nós" do rodapé. Não existe tela
    // separada de propósito: o texto já está aqui, e uma página nova seria
    // uma segunda versão da mesma história pra manter em dia.
    <section className="sobre" id="sobre" aria-labelledby="sobre-titulo">
      <div
        className="sobre__wrap"
        data-midia={
          video ? (video.largura > video.altura ? "deitado" : "em-pe") : midia ? "foto" : undefined
        }
      >
        <h2 className="sobre__titulo" id="sobre-titulo">
          <Raio />
          {sobre.titulo}
        </h2>

        {midia}

        <div className="sobre__texto">
          {sobre.paragrafos.map((p, i) => (
            <Fragment key={i}>
              <p>{p}</p>
              {i === 0 && sobre.grito ? (
                <p className="sobre__grito">
                  <Raio /> {sobre.grito}
                </p>
              ) : null}
            </Fragment>
          ))}

          {sobre.numeros.length ? (
            <dl className="sobre__numeros">
              {sobre.numeros.map((n, i) => (
                <div className="sobre__numero" key={`${i}-${n.rotulo}`}>
                  <dt>{n.rotulo}</dt>
                  {/* Ano (quatro dígitos) vai marcado como data, pra quem lê a página por máquina. */}
                  <dd>
                    {/^\d{4}$/.test(n.valor) ? <time dateTime={n.valor}>{n.valor}</time> : n.valor}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="sobre__fecho">
            <Link href={`/${site.categorias[2].handle}`} className="btn btn--preto">
              Conhecer os produtos
              <Raio className="btn__bolt" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
