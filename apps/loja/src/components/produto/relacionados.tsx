import { Raio } from "@/components/icones"
import { ColecaoCarrossel } from "@/components/home/colecao-carrossel"
import { CartaoProduto } from "@/components/produto/cartao"
import { buscarProdutoPorHandle, listarProdutos } from "@/lib/medusa"

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
  const [produtos, proprio] = await Promise.all([
    listarProdutos({ limite: LIMITE }),
    buscarProdutoPorHandle(handle),
  ])

  /*
   * Mesma categoria primeiro: num catálogo de barba e cabelo, oferecer
   * shampoo de barba pra quem olha tratamento de barba acerta mais que
   * oferecer spray de cabelo. Não é recomendação de verdade — é a melhor
   * aproximação que dá pra fazer sem histórico de compra.
   */
  const categoria = proprio?.categories?.[0]?.id
  const outros = produtos.filter((p) => p.handle !== handle)
  const ordenados = categoria
    ? [
        ...outros.filter((p) => p.categories?.some((c) => c.id === categoria)),
        ...outros.filter((p) => !p.categories?.some((c) => c.id === categoria)),
      ]
    : outros

  if (!ordenados.length) return null

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
          {ordenados.map((produto) => (
            <CartaoProduto key={produto.id} produto={produto} />
          ))}
        </ColecaoCarrossel>
      </div>
    </section>
  )
}
