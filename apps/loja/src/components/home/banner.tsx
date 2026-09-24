import { CarrosselDoBanner } from "@/components/home/carrossel-do-banner"
import { SlideDoBanner, type SlidePronto } from "@/components/home/slides-do-banner"
import type { SlideDoBanner as SlideGravado } from "@/lib/home"
import { buscarProdutoPorHandle, home } from "@/lib/medusa"

/**
 * O banner do topo: SÓ IMAGEM (decidido em 24/09). Cada slide é uma arte,
 * com o texto dentro dela, subida no painel ("Layout da home"), até 5 — a
 * do computador e a do celular (`slides-do-banner.tsx`). O slide inteiro
 * leva pro produto escolhido, ou pra vitrine.
 *
 * É o maior elemento visível quando a página abre — o que o Google mede
 * como LCP —, então a arte do primeiro slide vem sem lazy e na frente da
 * fila, e nada aqui depende de JavaScript pra aparecer.
 *
 * Sem arte publicada, não há banner: a home começa na barra de vantagens.
 * Um slide só: a arte, sem carrossel. Dois ou mais: o carrossel
 * (`carrossel-do-banner.tsx`).
 */
export async function Banner() {
  const { slides, tempo } = (await home()).conteudo.banner
  const prontos = await Promise.all(slides.map(montar))
  if (!prontos.length) return null
  if (prontos.length === 1)
    return <SlideDoBanner slide={prontos[0]!} primeiro comImagem raiz="section" />
  return <CarrosselDoBanner slides={prontos} tempo={tempo} />
}

async function montar(slide: SlideGravado): Promise<SlidePronto> {
  const produto = slide.produto ? await buscarProdutoPorHandle(slide.produto) : null
  return {
    titulo: slide.titulo,
    // Produto que saiu do site leva pra vitrine, e não pra uma página que não existe.
    href: produto ? `/produtos/${produto.handle}` : "/produtos",
    computador: slide.imagem,
    celular: slide.imagemCelular ?? null,
  }
}
