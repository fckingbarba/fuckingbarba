import Image from "next/image"
import { Estrelas } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { AVALIACOES, notaMedia } from "@/conteudo/depoimentos"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * O QUE DIZ QUEM USOU.
 *
 * Sai do mesmo `conteudo/depoimentos.ts` da home, filtrado por produto, e
 * **não aparece enquanto não houver avaliação de verdade** — o arquivo
 * começa vazio e explica o porquê. Estrela inventada é art. 37 do CDC, e
 * quando vai junto de dado estruturado o Google derruba o rich snippet da
 * LOJA INTEIRA, não só da página.
 *
 * DIFERENTE DA HOME, AQUI NÃO ANDA SOZINHO. Na home as avaliações passam
 * numa esteira porque são enfeite de confiança; numa página de produto a
 * pessoa LÊ avaliação, e texto que se move enquanto se lê é hostil. Aqui é
 * lista parada.
 *
 * O `AggregateRating` é a média DO QUE ESTÁ PUBLICADO nesta página, e não
 * "a nota da loja" — é a única coisa que dá pra provar olhando a própria
 * tela, que é exatamente o critério do Google pra essa marcação.
 */
export async function Avaliacoes({ handle }: { handle: string }) {
  const avaliacoes = AVALIACOES.filter((a) => a.produtoHandle === handle)
  if (!avaliacoes.length) return null

  const media = notaMedia(avaliacoes)
  const produto = await buscarProdutoPorHandle(handle)
  const foto = produto?.thumbnail ?? produto?.images?.[0]?.url ?? null

  return (
    <section className="avaliacoes" id="avaliacoes" aria-labelledby="avaliacoes-titulo">
      <div className="avaliacoes__wrap">
        <h2 className="avaliacoes__titulo" id="avaliacoes-titulo">
          <Raio />O que diz quem usou
        </h2>

        {media !== null ? (
          <p
            className="avaliacoes__nota"
            itemProp="aggregateRating"
            itemScope
            itemType="https://schema.org/AggregateRating"
          >
            <meta itemProp="ratingValue" content={media.toFixed(1)} />
            <meta itemProp="reviewCount" content={String(avaliacoes.length)} />
            <meta itemProp="bestRating" content="5" />
            <Estrelas
              nota={media}
              rotulo={`Nota ${media.toFixed(1).replace(".", ",")} de 5, em ${avaliacoes.length} ${
                avaliacoes.length === 1 ? "avaliação" : "avaliações"
              }`}
            />
          </p>
        ) : null}

        <ul className="avaliacoes__lista">
          {avaliacoes.map((a) => (
            <li key={`${a.nome}-${a.texto.slice(0, 24)}`}>
              <article className="avaliacao">
                {foto ? (
                  <span className="avaliacao__foto">
                    <Image src={foto} alt="" width={160} height={160} loading="lazy" />
                  </span>
                ) : null}

                <div className="avaliacao__corpo">
                  <p className="avaliacao__topo">
                    <span className="avaliacao__nome">{a.nome}</span>
                    {a.compraVerificada ? <SeloVerificado /> : null}
                    <Estrelas
                      nota={a.nota}
                      rotulo={`Nota ${a.nota} de 5${
                        a.compraVerificada ? ", compra verificada" : ""
                      }`}
                    />
                  </p>
                  {/* O texto do cliente, sem edição. Corrigir a gramática
                      transforma depoimento em anúncio com nome de outra
                      pessoa — e o leitor percebe. */}
                  <p className="avaliacao__texto">{a.texto}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Só entra quando existe o pedido no sistema: é afirmação, não enfeite. */
function SeloVerificado() {
  return (
    <svg className="avaliacao__selo" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.4 1.8h7.2l5 5v7.2l-5 5H8.4l-5-5V6.8zm-.6 9.9 1.4-1.4h1.2l1.4 1.4 3.4-3.4h1.2l1.4 1.4-6 6z"
      />
    </svg>
  )
}
