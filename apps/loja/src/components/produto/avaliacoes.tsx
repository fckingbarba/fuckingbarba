import { Estrelas } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { DepoimentosSorteados } from "@/components/produto/depoimentos-sorteados"
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
 * TRÊS POR VISITA, sorteados da lista do produto
 * (`depoimentos-sorteados.tsx`), na grade do protótipo. Com todos na tela,
 * cada produto com trechos terminava numa parede de vinte cartões de texto
 * inteiro. O sorteio dá a mesma chance a cada depoimento — não escolhe "os
 * melhores".
 *
 * DIFERENTE DA HOME, AQUI NÃO ANDA SOZINHO. Na home as avaliações passam
 * numa esteira porque são enfeite de confiança; numa página de produto a
 * pessoa LÊ avaliação, e texto que se move enquanto se lê é hostil. Aqui é
 * lista parada — na grade do protótipo (`avaliacoes__grade`).
 *
 * O `AggregateRating` é a média de TODAS as avaliações publicadas do
 * produto — as estrelas em cima da grade —, e os três sorteados são uma
 * amostra delas, não a conta. Só das AVALIAÇÕES: trecho de entrevista não
 * tem nota, entra na lista como é ("Entrevista com cliente", sem nome e sem
 * estrela) e fica fora da conta.
 */
export async function Avaliacoes({ handle }: { handle: string }) {
  const avaliacoes = AVALIACOES.filter((a) => a.produtoHandle === handle)
  const trechos = TRECHOS.filter((t) => t.produtoHandle === handle)
  if (!avaliacoes.length && !trechos.length) return null

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

        <DepoimentosSorteados depoimentos={[...avaliacoes, ...trechos]} foto={foto} />
      </div>
    </section>
  )
}
