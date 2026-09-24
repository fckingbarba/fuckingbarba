import { getImageProps } from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { home } from "@/lib/medusa"
import { lerFundos, type FundoDaSecao } from "@/lib/pdp"
import { lerAjuste, resolver } from "@/lib/secoes/layout"
import type { Escopo } from "@/lib/secoes/registro"

/**
 * Monta as seções de uma página a partir do registro.
 *
 * É o único lugar do app que decide o que entra na página. As rotas viram
 * uma linha (`<Secoes escopo="home" />`) e param de saber quais seções
 * existem — que é o ponto: ligar, desligar e reordenar passa a ser dado, não
 * edição de JSX.
 *
 * Não leva `"use cache"` de propósito. Marcar aqui cacharia o HTML de TODAS
 * as seções como um bloco só, e cada uma tem o próprio tempo de vida (o
 * catálogo muda numa cadência, o texto editorial em outra). Como o que esta
 * função espera (o ajuste e os fundos) sai de leituras cacheadas — `home()`
 * e o produto —, ela continua pré-renderizável.
 */
export async function Secoes({ escopo, handle }: { escopo: Escopo; handle?: string }) {
  const ajuste = await lerAjuste(escopo, handle)

  // As fotos de fundo: as do produto (o `fb_pdp` dele) ou as da home publicada.
  const fundos =
    escopo === "produto" && handle
      ? await lerFundos(handle)
      : escopo === "home"
        ? (await home()).fundos
        : {}

  return resolver(escopo, ajuste).map((secao) => {
    // A união de `Secao` é o que garante, em tempo de compilação, que seção
    // de produto recebe o handle e seção de home não recebe nada.
    if (secao.escopo === "produto") {
      const Bloco = secao.componente
      return (
        <Fundo key={secao.id} id={secao.id} fundo={fundos[secao.id]}>
          <Bloco handle={handle ?? ""} />
        </Fundo>
      )
    }
    const Bloco = secao.componente
    return (
      <Fundo key={secao.id} id={secao.id} fundo={fundos[secao.id]}>
        <Bloco />
      </Fundo>
    )
  })
}

/**
 * ATÉ QUE LARGURA A FOTO DO CELULAR VALE, seção por seção — a largura em
 * que a seção ainda está numa coluna só, alta e estreita. Um corte só (768)
 * daria a foto deitada do computador pra seção que no tablet ainda é uma
 * coluna comprida: o "como funciona" mostraria um terço da foto, esticada.
 * Os números são os das grades de cada seção (`pdp-*.css`); as que não
 * mudam de coluna ficam no 767. O painel sugere as medidas pelas mesmas
 * contas (`apps/dashboard/src/lib/produtos.ts`).
 */
const CELULAR_ATE: Record<string, number> = {
  "produto.versus": 759,
  "produto.quem": 859,
  "produto.rotina": 879,
  "produto.funciona": 899,
  // As da home: as de `colecao.css`, `beneficios.css`, `vitrine.css` e `sobre.css`.
  "home.colecao": 760,
  "home.alta-performance": 720,
  "home.vitrine": 760,
  "home.sobre": 880,
}
const CELULAR_PADRAO = 767

/**
 * O EMBRULHO QUE DÁ COR À SEÇÃO.
 *
 * Sem fundo escolhido, NÃO EMBRULHA NADA — devolve a seção como ela é. Não é
 * economia de DOM: um `<div>` a mais em volta de toda seção mudaria o que
 * `> *` e `+` alcançam no CSS já escrito, e a esmagadora maioria das seções
 * não tem fundo próprio. O caso comum tem que sair exatamente como saía.
 *
 * A FOTO É UM `<picture>`, e não mais um `background-image`: passa pelo
 * otimizador de imagem do Next (cada tela baixa o tamanho dela, em AVIF ou
 * WebP), só carrega quando chega perto da tela (`lazy`), e troca pela do
 * celular abaixo do corte da seção. O fundo em CSS baixava o arquivo
 * inteiro, em todo aparelho, assim que a página abria.
 */
function Fundo({ id, fundo, children }: { id: string; fundo?: FundoDaSecao; children: ReactNode }) {
  if (!fundo) return <>{children}</>

  const comum = { alt: "", fill: true, sizes: "100vw" } as const
  const {
    props: { srcSet: doComputador, ...imagem },
  } = getImageProps({ ...comum, src: fundo.imagem })
  const doCelular = fundo.imagemCelular
    ? getImageProps({ ...comum, src: fundo.imagemCelular }).props.srcSet
    : null
  const estilo = fundo.veu ? ({ "--veu": String(fundo.veu) } as CSSProperties) : undefined

  return (
    <div className="fundo fundo--imagem" style={estilo}>
      <picture className="fundo__imagem">
        {doCelular ? (
          <source
            media={`(max-width: ${CELULAR_ATE[id] ?? CELULAR_PADRAO}px)`}
            srcSet={doCelular}
            sizes="100vw"
          />
        ) : null}
        {/* A "direção de arte" do Next: `getImageProps` + <picture>, pra ter as duas fotos. */}
        <img {...imagem} srcSet={doComputador} alt="" loading="lazy" decoding="async" />
      </picture>
      {children}
    </div>
  )
}
