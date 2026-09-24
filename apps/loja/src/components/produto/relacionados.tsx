import { Raio } from "@/components/icones"
import { ColecaoCarrossel } from "@/components/home/colecao-carrossel"
import { CartaoProduto } from "@/components/produto/cartao"
import type { HttpTypes } from "@medusajs/types"
import { conteudoDaPdp } from "@/conteudo/produto"
import { buscarProdutoPorHandle, listarProdutos, modeloDeRecomendacao } from "@/lib/medusa"
import { ordenarParaAPagina } from "@/lib/recomendacao"

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
 * A ORDEM É DO MOTOR DE RECOMENDAÇÃO (`ordenarParaAPagina`, em
 * `lib/recomendacao.ts`): o que mais vai junto com ESTE produto — pelos
 * pedidos da loja e pela rotina da PDP — vem primeiro. É o que faz o título
 * dizer a verdade. Continua sendo o resto do catálogo: o que não faz sentido
 * levar junto (as peças, na página do kit) vai pro fim em vez de sumir.
 * Ninguém escolhe no admin.
 */
const LIMITE = 12

/** O título de sempre; cada produto pode ter o seu (o painel, "Produtos relacionados"). */
const TITULO = "Quem leva este, leva junto"

export async function Relacionados({ handle }: { handle: string }) {
  // O catálogo da vitrine (a mesma leitura cacheada), e não só os doze
  // primeiros: o corte vem DEPOIS da ordem, senão o que mais combina podia
  // ficar de fora só por ter entrado tarde no catálogo.
  const [produtos, proprio, modelo, conteudo] = await Promise.all([
    listarProdutos(),
    buscarProdutoPorHandle(handle),
    modeloDeRecomendacao(),
    conteudoDaPdp(handle),
  ])

  const outros = produtos.filter((p) => p.handle !== handle)

  /*
   * Sem o modelo (o Medusa não respondeu), a aproximação de antes do motor:
   * mesma categoria primeiro — num catálogo de barba e cabelo, oferecer
   * shampoo de barba pra quem olha tratamento de barba acerta mais que
   * oferecer spray de cabelo.
   */
  const categoria = proprio?.categories?.[0]?.id
  const ordenados = modelo
    ? ordenarParaAPagina(outros, handle, modelo)
    : categoria
      ? [
          ...outros.filter((p) => p.categories?.some((c) => c.id === categoria)),
          ...outros.filter((p) => !p.categories?.some((c) => c.id === categoria)),
        ]
      : outros

  if (!ordenados.length) return null

  return (
    <Carrossel
      produtos={ordenados.slice(0, LIMITE)}
      titulo={conteudo.relacionados?.titulo ?? TITULO}
    />
  )
}

function Carrossel({ produtos, titulo }: { produtos: HttpTypes.StoreProduct[]; titulo: string }) {
  return (
    <section className="colecao colecao--relacionados" aria-labelledby="relacionados-titulo">
      <div className="colecao__wrap">
        <ColecaoCarrossel
          titulo={
            <h2 className="colecao__titulo" id="relacionados-titulo">
              <Raio />
              {titulo}
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
