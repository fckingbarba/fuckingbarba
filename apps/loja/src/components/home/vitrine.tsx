import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { CartaoProduto } from "@/components/produto/cartao"
import { listarProdutos } from "@/lib/medusa"
import { EM_BREVE } from "@/lib/site"

/**
 * A grade de produtos da home, com o mesmo card da faixa de coleção.
 *
 * Sobre o título: no protótipo era "Os mais pedidos da casa". Não dá pra
 * dizer isso ainda — a loja nova não vendeu nada, então não existe "mais
 * pedido". Fica "Todos os produtos", que é verdade hoje. Quando houver
 * histórico de pedidos no Medusa dá pra ordenar por venda de verdade e o
 * título volta, valendo.
 *
 * "Pronta entrega" também é condicional: só entra quando todos os produtos
 * da grade têm estoque. Um esgotado no meio já derruba a frase, porque ela
 * fala da grade inteira.
 */
const LIMITE = 12

export async function Vitrine() {
  const produtos = await listarProdutos({ limite: LIMITE })
  if (!produtos.length) return null

  const todosEmEstoque = produtos.every(temEstoque)

  return (
    <section className="vitrine" id="vitrine" aria-labelledby="vitrine-titulo">
      <div className="vitrine__wrap">
        <div className="vitrine__topo">
          <h2 className="vitrine__titulo" id="vitrine-titulo">
            <Raio />
            Todos os produtos
          </h2>
          <p className="vitrine__contagem">
            {produtos.length} {produtos.length === 1 ? "produto" : "produtos"}
            {todosEmEstoque ? " · pronta entrega" : null}
          </p>
        </div>

        <div className="vitrine__grade">
          {produtos.map((produto) => (
            <CartaoProduto key={produto.id} produto={produto} />
          ))}
        </div>

        <div className="vitrine__rodape">
          {/* Vira /produtos na fase 3, quando houver catálogo pra paginar. */}
          <Link href={EM_BREVE} className="btn">
            Ver todos os produtos
            <Raio className="btn__bolt" />
          </Link>
        </div>
      </div>
    </section>
  )
}

/**
 * Produto sem controle de estoque conta como disponível (é o que o Medusa
 * entende por `manage_inventory: false`); com controle, precisa ter peça.
 */
function temEstoque(produto: HttpTypes.StoreProduct): boolean {
  return (produto.variants ?? []).some(
    (v) => !v.manage_inventory || (v.inventory_quantity ?? 0) > 0
  )
}
