import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import { Carrinho } from "@/components/icones"
import { BotaoComprar } from "@/components/produto/comprar"
import { emReais } from "@/lib/formato"
import { frasesDoFrete, produtoSozinhoQualifica } from "@/lib/configuracoes"
import { PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"
import { configuracoes, precosDe, varianteDoCard } from "@/lib/medusa"

/**
 * O card de produto — o mesmo na faixa de coleção e, depois, na vitrine.
 *
 * Tudo que ele mostra é calculado do produto, nada é enfeite escrito à mão:
 *
 * - **o selo de desconto** só existe quando há preço cheio maior que o atual
 *   (o `original_price` da promoção). Sem promoção, sem selo;
 * - **a tarja de frete** só aparece quando existe política de frete E o
 *   produto sozinho já alcança o piso — alcança, não passa: a regra é `>=`, e
 *   o kit de 2 custa exatamente o piso. Pôr "frete grátis" num produto de
 *   R$ 54,90 quando o piso é R$ 149,90 é a mentira mais fácil de cometer numa
 *   vitrine, e a primeira que o cliente descobre no carrinho. A tarja também
 *   diz o que a política diz: com frete fixo ela mostra "Frete R$ 9,90", e
 *   sem política nenhuma ela não existe;
 * - **o parcelamento** sai do preço e do número de parcelas que o rodapé
 *   promete, então os dois não têm como discordar.
 *
 * O que NÃO tem aqui, e no protótipo tinha: a nota em estrelas. Aquilo era
 * 4,8 com 128 avaliações escritos no HTML, de exemplo. Avaliação inventada
 * não é enfeite — é prova social falsa, e em dado estruturado o Google trata
 * como motivo de punição. Entra quando houver avaliação de verdade.
 */
export async function CartaoProduto({
  produto,
  prioridade = false,
  destaque = false,
}: {
  produto: HttpTypes.StoreProduct
  /** Fotos acima da dobra não devem esperar: elas costumam ser o LCP. */
  prioridade?: boolean
  /** A primeira da grade: é a que vira o LCP, e ganha prioridade alta. */
  destaque?: boolean
}) {
  /*
    `"use cache"` lá dentro: numa grade de doze cards isto é UMA leitura, não
    doze — e nenhuma delas depois que o cache esquenta.
  */
  const { frete } = await configuracoes()
  const frases = frasesDoFrete(frete)

  const precos = precosDe(produto)
  const caminho = `/produtos/${produto.handle}` as const

  const desconto =
    precos?.cheio != null ? Math.round((1 - precos.atual / precos.cheio) * 100) : null

  const variante = varianteDoCard(produto)
  const temTarja = precos != null && produtoSozinhoQualifica(frete, precos.atual)
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
              // Os primeiros da grade carregam na hora (sem `lazy`), e o
              // primeiro de todos — o LCP da categoria — com prioridade alta.
              // Era `priority`, descontinuado no Next 16: virava só um preload
              // de prioridade baixa.
              loading={prioridade ? "eager" : "lazy"}
              fetchPriority={destaque ? "high" : undefined}
              sizes="(max-width: 640px) 70vw, 280px"
            />
          ) : null}
        </Link>

        {desconto ? <span className="produto__selo">-{desconto}%</span> : null}

        {/* Era "Frete grátis" alternando com "Envio imediato" — e a loja não
            posta na hora: o prazo é o de postagem que ela configura no admin,
            e ele mora no checkout. Ficou o que a política de frete garante. */}
        {temTarja && frases ? (
          <p className="produto__frete">
            <span>{frases.selo}</span>
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

      {/* Põe na sacola e abre a gaveta. Produto com variação pra escolher,
          ou sem estoque, leva pra página dele (`varianteDoCard`). */}
      {variante ? (
        <BotaoComprar
          varianteId={variante}
          nome={produto.title}
          previa={
            precos
              ? { handle: produto.handle, imagem: produto.thumbnail ?? null, preco: precos.atual }
              : undefined
          }
          className="btn produto__comprar"
          icone={<Carrinho className="btn__icone" />}
        />
      ) : (
        <Link href={caminho} className="btn produto__comprar">
          Comprar
          <Carrinho className="btn__icone" />
        </Link>
      )}
    </article>
  )
}
