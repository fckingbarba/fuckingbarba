import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import { Carrinho } from "@/components/icones"
import { emReais } from "@/lib/formato"
import { precosDe } from "@/lib/medusa"
import { FRETE_GRATIS_A_PARTIR_DE, PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"

/**
 * O card de produto — o mesmo na faixa de coleção e, depois, na vitrine.
 *
 * Tudo que ele mostra é calculado do produto, nada é enfeite escrito à mão:
 *
 * - **o selo de desconto** só existe quando há preço cheio maior que o atual
 *   (o `original_price` da promoção). Sem promoção, sem selo;
 * - **a tarja de frete grátis** só aparece quando o produto sozinho já alcança
 *   o piso — alcança, não passa: a regra do Medusa é `>=`, e o kit de 2 custa
 *   exatamente o piso. Pôr "frete grátis" num produto de R$ 54,90 quando o
 *   piso é R$ 149,90 é a mentira mais fácil de cometer numa vitrine, e a
 *   primeira que o cliente descobre no carrinho;
 * - **o parcelamento** sai do preço e do número de parcelas que o rodapé
 *   promete, então os dois não têm como discordar.
 *
 * O que NÃO tem aqui, e no protótipo tinha: a nota em estrelas. Aquilo era
 * 4,8 com 128 avaliações escritos no HTML, de exemplo. Avaliação inventada
 * não é enfeite — é prova social falsa, e em dado estruturado o Google trata
 * como motivo de punição. Entra quando houver avaliação de verdade.
 */
export function CartaoProduto({
  produto,
  prioridade = false,
}: {
  produto: HttpTypes.StoreProduct
  /** Fotos acima da dobra não devem esperar: elas costumam ser o LCP. */
  prioridade?: boolean
}) {
  const precos = precosDe(produto)
  const caminho = `/produtos/${produto.handle}` as const

  const desconto =
    precos?.cheio != null ? Math.round((1 - precos.atual / precos.cheio) * 100) : null

  const freteGratis = precos != null && precos.atual >= FRETE_GRATIS_A_PARTIR_DE
  const parcela = precos ? precos.atual / PARCELAS_SEM_JUROS : 0
  const mostraParcela = parcela >= PARCELA_MINIMA

  return (
    <article className="produto">
      <div className="produto__midia">
        {/* aria-hidden e tabindex -1: o nome logo abaixo já é um link pro
            mesmo lugar, e dois links seguidos pro mesmo destino só fazem o
            leitor de tela repetir. Pro mouse, a foto continua clicável. */}
        <Link className="produto__foto" href={caminho} tabIndex={-1} aria-hidden="true">
          {produto.thumbnail ? (
            <Image
              src={produto.thumbnail}
              alt=""
              width={600}
              height={600}
              priority={prioridade}
              sizes="(max-width: 640px) 70vw, 280px"
            />
          ) : null}
        </Link>

        {desconto ? <span className="produto__selo">-{desconto}%</span> : null}

        {freteGratis ? (
          <p className="produto__frete">
            <span>Frete grátis</span>
            <span>Envio imediato</span>
          </p>
        ) : null}
      </div>

      <div className="produto__corpo">
        <h3 className="produto__nome">
          <Link href={caminho}>{produto.title}</Link>
        </h3>

        {precos ? (
          <p className="produto__preco">
            {precos.cheio != null ? (
              <span className="produto__de">{emReais(precos.cheio)}</span>
            ) : null}
            <span className="produto__por">{emReais(precos.atual)}</span>
          </p>
        ) : null}

        {precos && mostraParcela ? (
          <p className="produto__parcela">
            ou {PARCELAS_SEM_JUROS}x de {emReais(parcela)} sem juros
          </p>
        ) : null}
      </div>

      {/* Vira o gatilho da gaveta na fase 4; até lá leva pra página do
          produto, que é onde a compra acontece de verdade hoje. */}
      <Link href={caminho} className="btn produto__comprar">
        Comprar
        <Carrinho className="btn__icone" />
      </Link>
    </article>
  )
}
