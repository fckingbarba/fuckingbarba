import { Raio } from "@/components/icones"
import { ColecaoCarrossel } from "@/components/home/colecao-carrossel"
import { CartaoProduto } from "@/components/produto/cartao"
import type { HttpTypes } from "@medusajs/types"
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
 * ┌─ ESTA SEÇÃO NÃO É O CROSS-SELL ────────────────────────────────────────┐
 * │ Por uns dias ela foi: a escolha do admin ("produtos que combinam")     │
 * │ mandava aqui, e o carrossel passava a mostrar só aqueles dois. Estava  │
 * │ errado por dois motivos.                                              │
 * │                                                                        │
 * │ Um: a oferta agora vive na CAIXA DE COMPRA, ao lado do preço, onde a   │
 * │ pessoa já decidiu comprar e marcar uma caixinha custa um clique. Com   │
 * │ a escolha mandando aqui também, os mesmos dois produtos apareciam      │
 * │ duas vezes na mesma página — uma como oferta, outra como vitrine.     │
 * │                                                                        │
 * │ Dois: escolher dois produtos pro cross-sell ENCOLHIA a descoberta.     │
 * │ Este carrossel é "o que mais existe na loja"; trocá-lo por dois        │
 * │ cartões tira do cliente a única vista do resto do catálogo que a PDP   │
 * │ oferece. São trabalhos diferentes e agora cada um tem o seu.           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A CURADORIA AQUI É "O RESTO DO CATÁLOGO", que com seis produtos é
 * honesto. Quando passar de umas doze peças isto vira coleção de verdade no
 * Medusa e a escolha passa a ser do admin — o que muda aqui é só a consulta.
 */
const LIMITE = 12

export async function Relacionados({ handle }: { handle: string }) {
  const [produtos, proprio] = await Promise.all([
    listarProdutos({ limite: LIMITE }),
    buscarProdutoPorHandle(handle),
  ])

  const outros = produtos.filter((p) => p.handle !== handle)

  /*
   * Mesma categoria primeiro: num catálogo de barba e cabelo, oferecer
   * shampoo de barba pra quem olha tratamento de barba acerta mais que
   * oferecer spray de cabelo. Não é recomendação de verdade — é a melhor
   * aproximação que dá pra fazer sem histórico de compra.
   */
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
