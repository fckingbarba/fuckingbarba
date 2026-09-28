import Link from "next/link"
import { Raio } from "@/components/icones"
import { CartaoProduto } from "@/components/produto/cartao"
import { maisVendidosPrimeiro } from "@/lib/catalogo"
import { home, listarProdutos, maisVendidos } from "@/lib/medusa"
import { ColecaoCarrossel } from "./colecao-carrossel"

/**
 * A faixa "Alta Performance" — a primeira vez que o visitante vê produto na
 * home, num carrossel.
 *
 * O catálogo, até doze, dos mais vendidos pros menos (pedido da loja em
 * 28/09 — `maisVendidosPrimeiro`, em `lib/catalogo.ts`: os últimos 90 dias
 * de venda, na loja nova e na Nuvemshop, e o esgotado no fim). Se um dia a
 * curadoria for do admin (uma coleção do Medusa), o que muda aqui é só a
 * chamada.
 *
 * Sem produto, a seção não aparece — carrossel vazio com seta desabilitada é
 * pior que seção nenhuma. O título vem do painel ("Layout da home").
 */
const LIMITE = 12

export async function Colecao() {
  const [todos, ordem, { conteudo }] = await Promise.all([listarProdutos(), maisVendidos(), home()])
  const produtos = maisVendidosPrimeiro(todos, ordem).slice(0, LIMITE)
  if (!produtos.length) return null

  return (
    <section className="colecao" aria-labelledby="colecao-titulo">
      <div className="colecao__wrap">
        <ColecaoCarrossel
          titulo={
            <h2 className="colecao__titulo" id="colecao-titulo">
              <Raio />
              {conteudo.colecao.titulo}
            </h2>
          }
        >
          {/* Nenhum card com `prioridade`: esta faixa fica bem abaixo da
              dobra, depois do banner, das vantagens e das ofertas. Marcar as
              primeiras fotos como prioritárias aqui não adianta a primeira
              tela — faz elas disputarem banda justamente com a foto do
              banner, que é o maior elemento visível e o que o Google mede. */}
          {produtos.map((produto) => (
            <CartaoProduto key={produto.id} produto={produto} />
          ))}
        </ColecaoCarrossel>

        <div className="colecao__rodape">
          <Link href="/produtos" className="btn">
            Ver toda a coleção
            <Raio className="btn__bolt" />
          </Link>
        </div>
      </div>
    </section>
  )
}
