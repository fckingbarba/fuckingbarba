import { getImageProps } from "next/image"
import { Estrelas } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { AVALIACOES, TRECHOS, notaMedia } from "@/conteudo/depoimentos"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * O QUE DIZ QUEM USOU.
 *
 * Sai do mesmo `conteudo/depoimentos.ts` da home, filtrado por produto, e
 * **não aparece enquanto não houver depoimento de verdade** — avaliação ou
 * trecho de entrevista. Estrela inventada é art. 37 do CDC, e quando vai
 * junto de dado estruturado o Google derruba o rich snippet da LOJA INTEIRA,
 * não só da página.
 *
 * DIFERENTE DA HOME, AQUI NÃO ANDA SOZINHO. Na home as avaliações passam
 * numa esteira porque são enfeite de confiança; numa página de produto a
 * pessoa LÊ avaliação, e texto que se move enquanto se lê é hostil. Aqui é
 * lista parada — na grade do protótipo (`avaliacoes__grade`).
 *
 * O `AggregateRating` é a média DO QUE ESTÁ PUBLICADO nesta página, e não
 * "a nota da loja" — é a única coisa que dá pra provar olhando a própria
 * tela, que é exatamente o critério do Google pra essa marcação. Só das
 * AVALIAÇÕES: trecho de entrevista não tem nota, entra na lista como é
 * ("Entrevista com cliente", sem nome e sem estrela) e fica fora da conta.
 *
 * A foto do cartão é um `<img>` do `getImageProps`, no tamanho da caixa
 * (54 px): o mesmo motivo da esteira da home — ver o topo de
 * `components/home/esteira-de-avaliacoes.tsx`.
 */
export async function Avaliacoes({ handle }: { handle: string }) {
  const avaliacoes = AVALIACOES.filter((a) => a.produtoHandle === handle)
  const trechos = TRECHOS.filter((t) => t.produtoHandle === handle)
  if (!avaliacoes.length && !trechos.length) return null

  const media = notaMedia(avaliacoes)
  const produto = await buscarProdutoPorHandle(handle)
  const foto = produto?.thumbnail ?? produto?.images?.[0]?.url ?? null
  const miniatura = foto ? (
    <span className="avaliacao__foto">
      {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps: a foto já sai otimizada, sem o componente */}
      <img {...getImageProps({ src: foto, alt: "", width: 54, height: 54 }).props} alt="" />
    </span>
  ) : null

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

        <ul className="avaliacoes__grade">
          {avaliacoes.map((a) => (
            <li key={`${a.nome}-${a.texto.slice(0, 24)}`}>
              <article className="avaliacao">
                {miniatura}

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
          {trechos.map((t, i) => (
            <li key={`trecho-${i}`}>
              <article className="avaliacao">
                {miniatura}

                <div className="avaliacao__corpo">
                  <p className="avaliacao__topo">
                    <span className="avaliacao__nome">Entrevista com cliente</span>
                  </p>
                  <p className="avaliacao__texto">{t.texto}</p>
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
