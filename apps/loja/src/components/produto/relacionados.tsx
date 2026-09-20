import { Raio } from "@/components/icones"
import { ColecaoCarrossel } from "@/components/home/colecao-carrossel"
import { CartaoProduto } from "@/components/produto/cartao"
import type { HttpTypes } from "@medusajs/types"
import { buscarProdutoPorHandle, listarProdutos } from "@/lib/medusa"
import { pdpDoProduto } from "@/lib/pdp"

/**
 * QUEM LEVA ESTE, LEVA JUNTO.
 *
 * Mesmo carrossel da home, com a classe `--relacionados` que troca o fundo:
 * é a última seção antes do rodapé e precisa se separar da anterior sem
 * inventar um desenho novo.
 *
 * O PRÓPRIO PRODUTO NUNCA APARECE AQUI. Parece óbvio e não é: qualquer lista
 * de "relacionados" devolve ele nas primeiras posições, porque ele é o mais
 * parecido com ele mesmo. Os kits de quantidade também ficam de fora — o
 * degrau lá em cima já ofereceu, e repetir aqui é oferecer duas vezes a
 * mesma decisão (o `listarProdutos` já os filtra).
 *
 * A CURADORIA HOJE É "O RESTO DO CATÁLOGO", que com seis produtos é
 * honesto. Quando passar de umas doze peças isto vira coleção de verdade no
 * Medusa e a escolha passa a ser do admin — o que muda aqui é só a consulta.
 */
const LIMITE = 12

export async function Relacionados({ handle }: { handle: string }) {
  const [produtos, proprio, pdp] = await Promise.all([
    listarProdutos({ limite: LIMITE }),
    buscarProdutoPorHandle(handle),
    pdpDoProduto(handle),
  ])
  const escolhidos = pdp.combinada.produtos ?? []

  /*
   * Mesma categoria primeiro: num catálogo de barba e cabelo, oferecer
   * shampoo de barba pra quem olha tratamento de barba acerta mais que
   * oferecer spray de cabelo. Não é recomendação de verdade — é a melhor
   * aproximação que dá pra fazer sem histórico de compra.
   */
  /*
    ESCOLHA A DEDO PRIMEIRO, automático como queda.
    
    Quem curou no admin quer aquilo, naquela ordem. Quem não curou continua
    recebendo o resto do catálogo — se a lista vazia significasse "não mostre
    nada", ligar este campo esvaziaria a seção no catálogo inteiro de uma vez,
    em todo produto que ninguém tocou ainda.
    
    Handle que não existe mais é ignorado em silêncio: produto sai do
    catálogo e ninguém volta em todas as PDPs pra tirar a referência.
  */
  const outros = produtos.filter((p) => p.handle !== handle)

  if (escolhidos.length) {
    const porHandle = new Map(outros.map((p) => [p.handle ?? "", p]))
    const curados = escolhidos.map((h) => porHandle.get(h)).filter((p) => p !== undefined)
    if (curados.length) return <Carrossel produtos={curados} />
  }

  const categoria = proprio?.categories?.[0]?.id
  const ordenados = categoria
    ? [
        ...outros.filter((p) => p.categories?.some((c) => c.id === categoria)),
        ...outros.filter((p) => !p.categories?.some((c) => c.id === categoria)),
      ]
    : outros

  if (!ordenados.length) return null

  return <Carrossel produtos={ordenados} />
}

function Carrossel({ produtos }: { produtos: HttpTypes.StoreProduct[] }) {
  return (
    <section className="colecao colecao--relacionados" aria-labelledby="relacionados-titulo">
      <div className="colecao__wrap">
        <ColecaoCarrossel
          titulo={
            <h2 className="colecao__titulo" id="relacionados-titulo">
              <Raio />
              Quem leva este, leva junto
            </h2>
          }
        >
          {produtos.map((produto) => (
            <CartaoProduto key={produto.id} produto={produto} />
          ))}
        </ColecaoCarrossel>
      </div>
    </section>
  )
}
