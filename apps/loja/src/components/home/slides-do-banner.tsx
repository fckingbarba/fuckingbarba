import type { Route } from "next"
import Image, { getImageProps } from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { BotaoComprar } from "@/components/produto/comprar"

/**
 * OS DOIS JEITOS DE UM SLIDE DO BANNER — o mesmo desenho no banner de um
 * slide só (servidor, `banner.tsx`) e no carrossel (`carrossel-do-banner.tsx`).
 *
 * - A ARTE (`SlideDeArte`): a imagem ocupa o banner inteiro, com o texto
 *   dentro dela, como os banners da loja na Nuvemshop — a do computador,
 *   deitada (1920 × 700), e a do celular, em pé (4 × 5), trocada abaixo de
 *   768 px. A caixa tem a proporção da arte e a imagem aparece INTEIRA
 *   (`contain`): arte tem texto, e cortar a borda cortaria a frase. O slide
 *   inteiro é o link.
 * - O PRODUTO (`SlideDeProduto`): o banner de sempre — o painel amarelo com
 *   chapéu, título, o preço e o botão que põe na sacola, e a foto do
 *   produto do lado.
 *
 * Sem hook de propósito: o servidor desenha o banner de um slide só com os
 * mesmos componentes que o carrossel usa no navegador.
 *
 * `comImagem: false` desenha o slide sem a foto — é como o carrossel deixa
 * pra baixar a imagem de um slide só quando ele está pra aparecer.
 */

export type SlidePronto =
  | {
      tipo: "arte"
      /** A descrição da arte: pra quem não enxerga e pro Google. */
      titulo: string
      href: string
      computador: string
      celular: string | null
    }
  | {
      tipo: "produto"
      chapeu: string
      titulo: string
      chamada: string
      href: string
      nome: string
      foto: string
      inteiro: string
      centavos: string
      /** A variação que o botão põe na sacola; sem ela (sem estoque), o botão leva pra página. */
      varianteId: string | null
    }

/** As medidas da arte — as mesmas que o painel sugere (`apps/dashboard/src/lib/home.ts`). */
export const ARTE_DO_COMPUTADOR = [1920, 700] as const
export const ARTE_DO_CELULAR = [1080, 1350] as const

type Comum = {
  /** O primeiro slide é o LCP da home: baixa na frente da fila. */
  primeiro: boolean
  comImagem: boolean
  /** `section` no banner de um slide só; `div` dentro do carrossel, que já é a seção. */
  raiz: "section" | "div"
}

export function SlideDeArte({
  slide,
  primeiro,
  comImagem,
  raiz: Raiz,
}: Comum & { slide: Extract<SlidePronto, { tipo: "arte" }> }) {
  const comum = { alt: slide.titulo, sizes: "100vw" } as const
  const { props: doComputador } = getImageProps({
    ...comum,
    src: slide.computador,
    width: ARTE_DO_COMPUTADOR[0],
    height: ARTE_DO_COMPUTADOR[1],
  })
  const doCelular = slide.celular
    ? getImageProps({
        ...comum,
        src: slide.celular,
        width: ARTE_DO_CELULAR[0],
        height: ARTE_DO_CELULAR[1],
      }).props.srcSet
    : null

  return (
    <Raiz
      className={`banner-arte${slide.celular ? "" : " banner-arte--sem-celular"}`}
      aria-label={Raiz === "section" ? slide.titulo : undefined}
    >
      <Link href={slide.href as Route} className="banner-arte__link">
        {comImagem ? (
          <picture>
            {doCelular ? (
              <source media="(max-width: 767px)" srcSet={doCelular} sizes="100vw" />
            ) : null}
            {/* A "direção de arte" do Next: `getImageProps` + <picture>, pra ter as duas artes. */}
            <img
              {...doComputador}
              alt={slide.titulo}
              loading={primeiro ? "eager" : "lazy"}
              fetchPriority={primeiro ? "high" : "low"}
            />
          </picture>
        ) : (
          <span className="sr-only">{slide.titulo}</span>
        )}
      </Link>
    </Raiz>
  )
}

export function SlideDeProduto({
  slide,
  primeiro,
  comImagem,
  raiz: Raiz,
}: Comum & { slide: Extract<SlidePronto, { tipo: "produto" }> }) {
  return (
    <Raiz
      className="banner"
      aria-label={Raiz === "section" ? `${slide.chapeu}: ${slide.titulo}` : undefined}
    >
      <div className="banner__texto">
        <p className="banner__kicker">{slide.chapeu}</p>
        <p className="banner__titulo">{slide.titulo}</p>
        <p className="banner__por">Por apenas</p>
        <p className="banner__preco">
          <span className="banner__preco-inteiro">{slide.inteiro}</span>
          <span className="banner__preco-centavos">{slide.centavos}</span>
        </p>
        {/* "Comprar agora" compra: põe o produto na sacola e abre a gaveta, como
            todo "Comprar" da vitrine (pedido de 23/09). Sem estoque, leva
            pra página do produto, que diz isso antes do clique. */}
        {slide.varianteId ? (
          <BotaoComprar
            varianteId={slide.varianteId}
            nome={slide.nome}
            className="btn btn--branco"
            rotulo={slide.chamada}
            icone={<Raio className="btn__bolt" />}
          />
        ) : (
          <Link href={slide.href as Route} className="btn btn--branco">
            {slide.chamada}
            <Raio className="btn__bolt" />
          </Link>
        )}
      </div>
      <div className="banner__midia">
        {comImagem ? (
          <Image
            src={slide.foto}
            alt={slide.nome}
            width={600}
            height={600}
            // `fetchPriority="high"` + `eager`, e não `priority`: no Next 16 o
            // `priority` foi descontinuado e só punha um preload de prioridade
            // BAIXA no <head> — a foto principal entrava na fila atrás dos
            // scripts. No primeiro slide, é ela o LCP da página.
            loading={primeiro ? "eager" : "lazy"}
            fetchPriority={primeiro ? "high" : "low"}
            // A caixa da foto é metade do banner (720px no desktop), mas com
            // `contain` numa imagem quadrada só 450px ficam visíveis — o resto
            // é o branco dos lados. Pedir 720 era pedir 60% de bytes a mais
            // pra pintar exatamente o mesmo pixel.
            sizes="(max-width: 860px) 300px, 450px"
          />
        ) : null}
      </div>
    </Raiz>
  )
}

/** Um slide, do jeito dele. */
export function SlideDoBanner({ slide, ...resto }: Comum & { slide: SlidePronto }) {
  return slide.tipo === "arte" ? (
    <SlideDeArte slide={slide} {...resto} />
  ) : (
    <SlideDeProduto slide={slide} {...resto} />
  )
}
