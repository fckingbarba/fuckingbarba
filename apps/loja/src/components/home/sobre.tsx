import Image from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { SOBRE } from "@/conteudo/home"
import { buscarProdutoPorHandle } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * A história da marca.
 *
 * A foto sai do catálogo em vez de ser um arquivo à parte: é a mesma imagem
 * que o produto já usa, então não há uma segunda cópia pra manter atualizada
 * quando a embalagem mudar. Sem a foto, a seção continua — o texto é o que
 * ela veio dizer.
 *
 * Os números vêm de `conteudo/sobre.ts`, onde está o aviso de que precisam
 * ser conferidos: ano de fundação e clientes impactados são afirmações sobre
 * o negócio, não enfeite.
 */
export async function Sobre() {
  const produto = await buscarProdutoPorHandle(SOBRE.fotoDe)

  return (
    // `id="sobre"` é o destino do "Sobre nós" do rodapé. Não existe tela
    // separada de propósito: o texto já está aqui, e uma página nova seria
    // uma segunda versão da mesma história pra manter em dia.
    <section className="sobre" id="sobre" aria-labelledby="sobre-titulo">
      <div className="sobre__wrap">
        <h2 className="sobre__titulo" id="sobre-titulo">
          <Raio />
          {SOBRE.titulo}
        </h2>

        <div className="sobre__corpo">
          {produto?.thumbnail ? (
            <div className="sobre__midia">
              <Image
                src={produto.thumbnail}
                alt={produto.title}
                width={600}
                height={600}
                loading="lazy"
                sizes="(max-width: 860px) 100vw, 420px"
              />
            </div>
          ) : null}

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
          </div>
        </div>

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
    </section>
  )
}
