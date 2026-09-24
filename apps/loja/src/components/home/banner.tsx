import Image from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { BotaoComprar } from "@/components/produto/comprar"
import { emReaisPartido } from "@/lib/formato"
import { buscarProdutoPorHandle, home, precosDe, varianteDoCard } from "@/lib/medusa"

/**
 * O banner do topo. É o maior elemento visível quando a página abre — o que o
 * Google mede como LCP — então a foto vem sem lazy e na frente da fila (ver o
 * comentário no `<Image>`), e nada aqui depende de JavaScript pra aparecer.
 *
 * Preço e foto saem do produto em destaque, não de texto escrito à mão. A
 * diferença aparece no dia em que o preço muda no admin: assim o banner muda
 * junto, em vez de anunciar R$ 99,90 pra um produto que agora custa outra
 * coisa — que é o tipo de erro que vira reclamação no atendimento.
 *
 * A campanha (chapéu, título, o texto do botão e o produto) vem do painel,
 * no "Layout da home" (`home()`).
 */
export async function Banner() {
  const campanha = (await home()).conteudo.banner
  const produto = await buscarProdutoPorHandle(campanha.produto)
  const precos = produto ? precosDe(produto) : null

  // Sem o produto em destaque não há banner: melhor a home começar na barra
  // de vantagens do que anunciar um preço que ninguém confirmou.
  if (!produto || !precos || !produto.thumbnail) return null

  const { inteiro, centavos } = emReaisPartido(precos.atual)
  const variante = varianteDoCard(produto)

  return (
    <section className="banner" aria-label={`${campanha.chapeu}: ${campanha.titulo}`}>
      <div className="banner__texto">
        <p className="banner__kicker">{campanha.chapeu}</p>
        <p className="banner__titulo">{campanha.titulo}</p>
        <p className="banner__por">Por apenas</p>
        <p className="banner__preco">
          <span className="banner__preco-inteiro">{inteiro}</span>
          <span className="banner__preco-centavos">{centavos}</span>
        </p>
        {/* "Comprar agora" compra: põe o kit na sacola e abre a gaveta, como
            todo "Comprar" da vitrine (pedido de 23/09). Sem estoque, leva
            pra página do kit, que diz isso antes do clique. */}
        {variante ? (
          <BotaoComprar
            varianteId={variante}
            nome={produto.title}
            className="btn btn--branco"
            rotulo={campanha.chamada}
            icone={<Raio className="btn__bolt" />}
          />
        ) : (
          <Link href={`/produtos/${produto.handle}`} className="btn btn--branco">
            {campanha.chamada}
            <Raio className="btn__bolt" />
          </Link>
        )}
      </div>
      <div className="banner__midia">
        <Image
          src={produto.thumbnail}
          alt={produto.title}
          width={600}
          height={600}
          // `fetchPriority="high"` + `eager`, e não `priority`: no Next 16 o
          // `priority` foi descontinuado e só punha um preload de prioridade
          // BAIXA no <head> — a foto principal entrava na fila atrás dos
          // scripts. É ela o LCP da página.
          loading="eager"
          fetchPriority="high"
          // A caixa da foto é metade do banner (720px no desktop), mas com
          // `contain` numa imagem quadrada só 450px ficam visíveis — o resto
          // é o branco dos lados. Pedir 720 era pedir 60% de bytes a mais
          // pra pintar exatamente o mesmo pixel.
          sizes="(max-width: 860px) 300px, 450px"
        />
      </div>
    </section>
  )
}
