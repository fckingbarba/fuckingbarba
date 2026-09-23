import Image from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { emReaisPartido } from "@/lib/formato"
import { buscarProdutoPorHandle, precosDe } from "@/lib/medusa"

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
 * Só a campanha é escrita aqui. Quando houver mais de uma por mês, isto vira
 * conteúdo editável (uma coleção no Medusa); enquanto for uma, constante
 * resolve e não custa nada.
 */
const CAMPANHA = {
  handle: "kit-completo-para-barba",
  chapeu: "Semana do Cliente",
  titulo: "Nosso kit best seller",
  chamada: "Comprar agora",
} as const

export async function Banner() {
  const produto = await buscarProdutoPorHandle(CAMPANHA.handle)
  const precos = produto ? precosDe(produto) : null

  // Sem o produto em destaque não há banner: melhor a home começar na barra
  // de vantagens do que anunciar um preço que ninguém confirmou.
  if (!produto || !precos || !produto.thumbnail) return null

  const { inteiro, centavos } = emReaisPartido(precos.atual)

  return (
    <section className="banner" aria-label={`${CAMPANHA.chapeu}: ${CAMPANHA.titulo}`}>
      <div className="banner__texto">
        <p className="banner__kicker">{CAMPANHA.chapeu}</p>
        <p className="banner__titulo">{CAMPANHA.titulo}</p>
        <p className="banner__por">Por apenas</p>
        <p className="banner__preco">
          <span className="banner__preco-inteiro">{inteiro}</span>
          <span className="banner__preco-centavos">{centavos}</span>
        </p>
        <Link href={`/produtos/${produto.handle}`} className="btn btn--branco">
          {CAMPANHA.chamada}
          <Raio className="btn__bolt" />
        </Link>
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
