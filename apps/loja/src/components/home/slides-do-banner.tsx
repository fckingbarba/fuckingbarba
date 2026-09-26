import type { Route } from "next"
import { getImageProps } from "next/image"
import Link from "next/link"

/**
 * UM SLIDE DO BANNER: A ARTE — o mesmo desenho no banner de um slide só
 * (servidor, `banner.tsx`) e no carrossel (`carrossel-do-banner.tsx`).
 *
 * O banner é SÓ IMAGEM (decidido em 24/09): a arte ocupa o banner inteiro,
 * com o texto dentro dela, como os banners da loja na Nuvemshop — a do
 * computador, deitada (1920 × 630), e a do celular, em pé (1080 × 1275),
 * trocada abaixo de 768 px. A arte PREENCHE a caixa (`cover`, pelo centro):
 * sem faixa branca, e a arte de outra medida perde um pouco das bordas — o
 * painel avisa quanto. O slide inteiro é o link.
 *
 * AS MEDIDAS DE 26/09: o banner ficou mais baixo (era 1920 × 700 e 4 × 5), a
 * pedido da loja. A caixa nova ainda cabe as artes feitas antes (1920 × 700 e
 * 820 × 1000) cortando só a borda sem texto — conferido nas quatro artes no
 * ar naquele dia.
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
export const ARTE_DO_COMPUTADOR = [1920, 630] as const
export const ARTE_DO_CELULAR = [1080, 1275] as const

/**
 * A ARTE SAI EM QUALIDADE 60, e não nos 75 de toda foto da loja. Ela é a
 * maior imagem da home e é o LCP: no celular, a primeira coisa que a pessoa
 * espera ver. Em AVIF, 60 e 75 não se distinguem nem com o dobro de zoom
 * (conferido em 26/09 nas duas artes do Kit Premium, inclusive nas letras
 * miúdas dos rótulos), e a arte fica quase um terço mais leve: a do celular,
 * de 57 pra 40 KB na tela do Lighthouse (e de 76 pra 56 KB num celular de
 * tela 2x ou 3x); a do computador, de 95 pra 68 KB.
 *
 * Mexer aqui pede o valor novo em `images.qualities`, no next.config.ts.
 */
export const QUALIDADE_DA_ARTE = 60

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
  const comum = { alt: slide.titulo, sizes: "100vw", quality: QUALIDADE_DA_ARTE } as const
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
