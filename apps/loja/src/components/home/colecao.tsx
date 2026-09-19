import Link from "next/link"
import { Raio } from "@/components/icones"
import { CartaoProduto } from "@/components/produto/cartao"
import { listarProdutos } from "@/lib/medusa"
import { EM_BREVE } from "@/lib/site"
import { ColecaoCarrossel } from "./colecao-carrossel"

/**
 * A faixa "Alta Performance" — a primeira vez que o visitante vê produto na
 * home, num carrossel.
 *
 * Hoje ela mostra o catálogo inteiro, que é pequeno. Quando passar de umas
 * doze peças isto vira uma coleção de verdade no Medusa (Collections), e o
 * que muda aqui é só a chamada: a curadoria passa a ser do admin, não do
 * código. Enquanto são cinco produtos, coleção seria burocracia sem ganho.
 *
 * Sem produto, a seção não aparece — carrossel vazio com seta desabilitada é
 * pior que seção nenhuma.
 */
const LIMITE = 12

export async function Colecao() {
  const produtos = await listarProdutos({ limite: LIMITE })
  if (!produtos.length) return null

  return (
    <section className="colecao" aria-labelledby="colecao-titulo">
      <div className="colecao__wrap">
        <ColecaoCarrossel
          titulo={
            <h2 className="colecao__titulo" id="colecao-titulo">
              <Raio />
              Alta Performance: Barba e Cabelo
            </h2>
          }
        >
          {produtos.map((produto, i) => (
            // Os dois primeiros cards estão na primeira tela em telas largas;
            // o resto entra rolando e pode esperar.
            <CartaoProduto key={produto.id} produto={produto} prioridade={i < 2} />
          ))}
        </ColecaoCarrossel>

        <div className="colecao__rodape">
          {/* Vira /colecao ou a categoria cheia na fase 3. */}
          <Link href={EM_BREVE} className="btn">
            Ver toda a coleção
            <Raio className="btn__bolt" />
          </Link>
        </div>
      </div>
    </section>
  )
}
