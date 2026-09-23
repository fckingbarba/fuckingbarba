import Image from "next/image"
import Link from "next/link"
import { VideoDaMarca } from "@/components/home/video-da-marca"
import { Raio } from "@/components/icones"
import { SOBRE } from "@/conteudo/home"
import { buscarProdutoPorHandle, configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * A história da marca.
 *
 * A foto sai do catálogo em vez de ser um arquivo à parte: é a mesma imagem
 * que o produto já usa, então não há uma segunda cópia pra manter atualizada
 * quando a embalagem mudar. Sem a foto, a seção continua — o texto é o que
 * ela veio dizer.
 *
 * COM VÍDEO, O VÍDEO MANDA. O admin sobe um em Configurações da loja → Home
 * (`home.video` das configurações), e ele entra no lugar da foto — que vira a
 * capa dele até começar a tocar (`video-da-marca.tsx`).
 *
 * ┌─ ENXUTA: TUDO AO LADO DA FOTO ─────────────────────────────────────────┐
 * │ Título, texto, números e o botão moram na coluna do lado da mídia, e   │
 * │ não em faixas empilhadas embaixo dela. A seção passou a ter a altura   │
 * │ da foto (ou do vídeo) em vez da soma de tudo. No celular, empilha:     │
 * │ título, mídia, texto.                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Os números vêm de `conteudo/home.ts`, onde está o aviso de que precisam
 * ser conferidos: ano de fundação e clientes impactados são afirmações sobre
 * o negócio, não enfeite.
 */
export async function Sobre() {
  const [produto, { home }] = await Promise.all([
    buscarProdutoPorHandle(SOBRE.fotoDe),
    configuracoes(),
  ])
  const capa = produto?.thumbnail ?? null
  const video = home.video

  const midia = video ? (
    <VideoDaMarca video={video} capa={capa} titulo={SOBRE.titulo} />
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
          {SOBRE.titulo}
        </h2>

        {midia}

        <div className="sobre__texto">
          {SOBRE.paragrafos.map((p, i) =>
            typeof p === "string" ? (
              <p key={i}>{p}</p>
            ) : (
              <p className="sobre__grito" key={i}>
                <Raio /> {p.grito}
              </p>
            )
          )}

          <dl className="sobre__numeros">
            {SOBRE.numeros.map((n) => (
              <div className="sobre__numero" key={n.rotulo}>
                <dt>{n.rotulo}</dt>
                <dd>{"ano" in n ? <time dateTime={n.ano}>{n.valor}</time> : n.valor}</dd>
              </div>
            ))}
          </dl>

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
