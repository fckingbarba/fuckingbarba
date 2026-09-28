import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { CartaoProduto } from "@/components/produto/cartao"
import { maisVendidosPrimeiro } from "@/lib/catalogo"
import { home, listarProdutos, maisVendidos } from "@/lib/medusa"

/**
 * A grade de produtos da home, com o mesmo card da faixa de coleção.
 *
 * OS OITO MAIS VENDIDOS, e não o catálogo (pedido da loja em 28/09): os que
 * mais venderam nos últimos 90 dias, na loja nova e na Nuvemshop
 * (`maisVendidosPrimeiro`, em `lib/catalogo.ts`); o resto está a um clique,
 * no "Ver todos os produtos". A ordem vem antes do corte — ver lá.
 *
 * Sobre o título (do painel, "Layout da home"): no protótipo era "Os mais
 * pedidos da casa", e até 28/09 não dava pra dizer isso — a grade não era
 * ordenada por venda. Agora é, e "Os mais vendidos" pode ir pro painel; o de
 * fábrica segue "Todos os produtos".
 *
 * "Pronta entrega" também é condicional: só entra quando todos os produtos
 * da grade têm estoque. Um esgotado no meio já derruba a frase, porque ela
 * fala da grade inteira.
 */
const LIMITE = 8

export async function Vitrine() {
  const [todos, ordem, { conteudo }] = await Promise.all([listarProdutos(), maisVendidos(), home()])
  const produtos = maisVendidosPrimeiro(todos, ordem).slice(0, LIMITE)
  if (!produtos.length) return null

  const todosEmEstoque = produtos.every(temEstoque)

  return (
    <section className="vitrine" id="vitrine" aria-labelledby="vitrine-titulo">
      <div className="vitrine__wrap">
        <div className="vitrine__topo">
          <h2 className="vitrine__titulo" id="vitrine-titulo">
            <Raio />
            {conteudo.vitrine.titulo}
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
          <Link href="/produtos" className="btn">
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
