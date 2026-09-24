import { CarrosselDoBanner } from "@/components/home/carrossel-do-banner"
import { SlideDoBanner, type SlidePronto } from "@/components/home/slides-do-banner"
import { emReaisPartido } from "@/lib/formato"
import type { SlideDoBanner as SlideGravado } from "@/lib/home"
import { buscarProdutoPorHandle, home, precosDe, varianteDoCard } from "@/lib/medusa"

/**
 * O banner do topo. É o maior elemento visível quando a página abre — o que o
 * Google mede como LCP —, então a imagem do primeiro slide vem sem lazy e na
 * frente da fila, e nada aqui depende de JavaScript pra aparecer.
 *
 * Os slides vêm do painel ("Layout da home"), até 5. Cada um é de um jeito
 * (`slides-do-banner.tsx`): a ARTE, que ocupa o banner inteiro com o texto
 * dentro dela e leva pro produto (ou pra vitrine), ou o PRODUTO, o banner de
 * sempre, com o preço e a foto do produto em destaque.
 *
 * No slide de produto, preço e foto saem do catálogo, não de texto escrito à
 * mão: o banner muda junto quando o preço muda no admin, em vez de anunciar
 * R$ 99,90 pra um produto que agora custa outra coisa — que é o tipo de erro
 * que vira reclamação no atendimento. Sem o produto (ou sem foto, ou sem
 * preço), o slide sai: melhor o banner com um slide a menos do que um preço
 * que ninguém confirmou. Sem slide nenhum, a home começa na barra de
 * vantagens.
 *
 * Um slide só: o banner de sempre, sem carrossel. Dois ou mais: o carrossel
 * (`carrossel-do-banner.tsx`).
 */
export async function Banner() {
  const { slides, tempo } = (await home()).conteudo.banner
  const prontos = (await Promise.all(slides.map(montar))).filter(
    (s): s is SlidePronto => s !== null
  )
  if (!prontos.length) return null
  if (prontos.length === 1)
    return <SlideDoBanner slide={prontos[0]!} primeiro comImagem raiz="section" />
  return <CarrosselDoBanner slides={prontos} tempo={tempo} />
}

async function montar(slide: SlideGravado): Promise<SlidePronto | null> {
  const produto = slide.produto ? await buscarProdutoPorHandle(slide.produto) : null

  if (slide.imagem) {
    return {
      tipo: "arte",
      titulo: slide.titulo,
      // Produto que saiu do site leva pra vitrine, e não pra uma página que não existe.
      href: produto ? `/produtos/${produto.handle}` : "/produtos",
      computador: slide.imagem,
      celular: slide.imagemCelular ?? null,
    }
  }

  const precos = produto ? precosDe(produto) : null
  if (!produto || !precos || !produto.thumbnail || !slide.chapeu || !slide.chamada) return null
  const { inteiro, centavos } = emReaisPartido(precos.atual)
  return {
    tipo: "produto",
    chapeu: slide.chapeu,
    titulo: slide.titulo,
    chamada: slide.chamada,
    href: `/produtos/${produto.handle}`,
    nome: produto.title,
    foto: produto.thumbnail,
    inteiro,
    centavos,
    varianteId: varianteDoCard(produto),
  }
}
