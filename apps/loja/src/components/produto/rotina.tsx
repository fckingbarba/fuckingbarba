import { Raio } from "@/components/icones"
import { RotinaEscolha, type ItemEscolhivel } from "@/components/produto/rotina-escolha"
import { conteudoDaPdp } from "@/conteudo/produto"
import { buscarProdutoPorHandle, precosDe, temEstoque } from "@/lib/medusa"

/**
 * A ROTINA — limpa, trata, hidrata.
 *
 * É o cross-sell que não parece cross-sell, porque não é: a pele limpa
 * absorve melhor e o fio novo precisa de óleo pra não ficar áspero. A
 * sequência é argumento de uso antes de ser oferta.
 *
 * O PRODUTO DESTA PÁGINA ENTRA SOZINHO, marcado e travado. Ele é o passo 2 e
 * não faz sentido desmarcar — quem está aqui já decidiu por ele. Os outros
 * nascem desmarcados: rotina que vem com tudo marcado é caixinha
 * pré-selecionada, e disso o cliente desconfia com razão.
 *
 * PREÇO, FOTO E ESTOQUE SAEM DO CATÁLOGO. O conteúdo editorial diz só quais
 * produtos e por quê ("tira sebo e resíduo"). Produto que sumiu do catálogo
 * ou ficou sem estoque cai fora da lista em vez de virar um cartão que não
 * dá pra comprar.
 */
export async function Rotina({ handle }: { handle: string }) {
  const c = conteudoDaPdp(handle).rotina
  if (!c) return null

  const proprio = await buscarProdutoPorHandle(handle)
  const varianteDele = proprio?.variants?.[0]
  const precoDele = proprio ? precosDe(proprio) : null
  if (!proprio || !varianteDele || !precoDele) return null

  const buscados = await Promise.all(
    c.itens.map(async (item): Promise<ItemEscolhivel | null> => {
      const p = await buscarProdutoPorHandle(item.handle)
      const variante = p?.variants?.[0]
      const precos = p ? precosDe(p) : null
      // Produto que sumiu do catálogo ou ficou sem estoque cai fora da lista
      // em vez de virar um cartão que não dá pra comprar.
      if (!p || !variante || !precos || !temEstoque(variante)) return null

      return {
        varianteId: variante.id,
        nome: p.title,
        foto: p.thumbnail ?? p.images?.[0]?.url ?? null,
        preco: precos.atual,
        cheio: precos.cheio,
        passo: item.passo,
        para: item.para,
        fixo: false,
      }
    })
  )

  const acompanhantes = buscados.filter((i) => i !== null)

  const proprioNaRotina: ItemEscolhivel = {
    varianteId: varianteDele.id,
    nome: proprio.title,
    foto: proprio.thumbnail ?? proprio.images?.[0]?.url ?? null,
    preco: precoDele.atual,
    cheio: precoDele.cheio,
    // O passo do produto da página sai do conteúdo dos outros: se o shampoo
    // é o 1 e o óleo é o 3, o daqui é o 2. Escrever "Passo 2" à mão num
    // campo separado seria mais um lugar pra desencontrar.
    passo: "Passo 2 · trata",
    para: "O tratamento. Na pele, todo dia, sem enxaguar.",
    fixo: true,
  }

  /*
   * A ordem é a do conteúdo, com o produto da página no meio — não no
   * começo. A rotina se lê como sequência de uso, e o tratamento vem depois
   * da limpeza. Pôr o "nosso" em primeiro seria vitrine, não rotina.
   */
  const antes = acompanhantes.filter((i) => i.passo < proprioNaRotina.passo)
  const depois = acompanhantes.filter((i) => i.passo >= proprioNaRotina.passo)
  const itens = [...antes, proprioNaRotina, ...depois]

  // Sozinho ele não é rotina, é o produto de novo.
  if (itens.length < 2) return null

  return (
    <section className="rotina" aria-labelledby="rotina-titulo">
      <div className="rotina__wrap">
        <h2 className="rotina__titulo" id="rotina-titulo">
          <Raio />
          {c.titulo}
        </h2>

        <RotinaEscolha itens={itens} />
      </div>
    </section>
  )
}
