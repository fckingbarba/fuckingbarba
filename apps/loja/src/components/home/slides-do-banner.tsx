import type { Route } from "next"
import { getImageProps } from "next/image"
import Link from "next/link"

/**
 * UM SLIDE DO BANNER: A ARTE — o mesmo desenho no banner de um slide só
 * (servidor, `banner.tsx`) e no carrossel (`carrossel-do-banner.tsx`).
 *
 * O banner é SÓ IMAGEM (decidido em 24/09): a arte ocupa o banner inteiro,
 * com o texto dentro dela, como os banners da loja na Nuvemshop — a do
 * computador, deitada (1920 × 700), e a do celular, em pé (4 × 5), trocada
 * abaixo de 768 px. A caixa tem a proporção da arte e a imagem aparece
 * INTEIRA (`contain`): arte tem texto, e cortar a borda cortaria a frase. O
 * slide inteiro é o link.
 *
 * Sem hook de propósito: o servidor desenha o banner de um slide só com o
 * mesmo componente que o carrossel usa no navegador.
 *
 * `comImagem: false` desenha o slide sem a imagem — é como o carrossel deixa
 * pra baixar a arte de um slide só quando ele está pra aparecer.
 */

export type SlidePronto = {
  /** A descrição da arte: pra quem não enxerga e pro Google. */
  titulo: string
  href: string
  computador: string
  celular: string | null
}

/** As medidas da arte — as mesmas que o painel sugere (`apps/dashboard/src/lib/home.ts`). */
export const ARTE_DO_COMPUTADOR = [1920, 700] as const
export const ARTE_DO_CELULAR = [1080, 1350] as const

export function SlideDoBanner({
  slide,
  primeiro,
  comImagem,
  raiz: Raiz,
}: {
  slide: SlidePronto
  /** O primeiro slide é o LCP da home: baixa na frente da fila. */
  primeiro: boolean
  comImagem: boolean
  /** `section` no banner de um slide só; `div` dentro do carrossel, que já é a seção. */
  raiz: "section" | "div"
}) {
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
