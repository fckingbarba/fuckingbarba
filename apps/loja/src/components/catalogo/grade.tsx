import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { CartaoProduto } from "@/components/produto/cartao"
import type { HandleDeCategoria, Prateleira } from "@/lib/catalogo"

/**
 * A GRADE, O CONVITE, O VAZIO E O RESTO DA LOJA.
 *
 * As quatro peças que decidem o que a tela faz quando a categoria NÃO tem o
 * catálogo que o desenho pressupõe. O caso bonito — doze produtos numa grade
 * de quatro colunas — se resolve sozinho; o que precisa de código é
 * `/cabelo` com um item e uma categoria que esvaziou.
 */

/** Até quantos produtos uma categoria é "magra" e ganha o convite ao lado. */
const MAGRA_ATE = 2

export function Grade({
  produtos,
  maior,
  nome,
  prioritarios = 4,
}: {
  produtos: HttpTypes.StoreProduct[]
  /** A maior categoria fora esta — pro convite ter pra onde apontar. */
  maior: Prateleira | null
  nome: string
  /**
   * Quantas fotos entram sem lazy. Numa grade de categoria é uma delas que
   * costuma ser o maior elemento da primeira tela, e adiar justamente ela é
   * adiar o LCP. Quatro cobre a primeira fileira no desktop e as duas do
   * celular.
   */
  prioritarios?: number
}) {
  const magra = produtos.length > 0 && produtos.length <= MAGRA_ATE

  return (
    /*
      O `h2` que só o leitor de tela ouve: o nome do card é `h3` (na home ele
      mora em seções com `h2`), e aqui a grade vem logo depois do `h1` da
      página. Sem este título, quem navega pelos títulos pulava do 1 pro 3 —
      e o Lighthouse do CI, medindo a categoria COM produto, reprova isso.
    */
    <section aria-labelledby="grade-titulo">
      <h2 className="sr-only" id="grade-titulo">
        Produtos
      </h2>
      <div
        className="catalogo__grade"
        /*
          O número, e não só a presença: o CSS usa `[data-magra="2"]` pra
          decidir se o convite começa na segunda ou na terceira coluna. Com um
          atributo vazio ele começaria sempre na segunda e ficaria por cima do
          segundo card.
        */
        data-magra={magra ? String(produtos.length) : undefined}
      >
        {produtos.map((produto, i) => (
          <CartaoProduto key={produto.id} produto={produto} prioridade={i < prioritarios} />
        ))}
        {magra && maior ? <Convite nome={nome} quantos={produtos.length} maior={maior} /> : null}
      </div>
    </section>
  )
}

/**
 * O CONVITE — ocupa a célula vazia ao lado do card solitário.
 *
 * Um produto numa grade de quatro colunas deixa três quartos da tela em
 * branco, e branco desse tamanho não lê como "categoria pequena": lê como
 * "página quebrada". Esticar o card faria a foto de 1024px aparecer borrada,
 * e centralizar só muda o branco de lugar. Então a célula seguinte diz em
 * voz alta o que a tela já estava dizendo baixinho, e aponta pra onde tem o
 * que ver.
 */
function Convite({ nome, quantos, maior }: { nome: string; quantos: number; maior: Prateleira }) {
  const destino: `/${HandleDeCategoria}` = `/${maior.handle}`

  return (
    <aside className="convite">
      <p className="convite__olho">Categoria nova</p>
      <h2 className="convite__titulo">{nome} está começando</h2>
      <p className="convite__texto">
        {quantos === 1 ? "Um produto só" : `${quantos} produtos`}, por enquanto. O forte da casa
        ainda é {maior.nome.toLowerCase()} — e é de lá que sai a rotina inteira.
      </p>
      <Link className="btn btn--contorno" href={destino}>
        Ver {maior.produtos.length} de {maior.nome.toLowerCase()}
        <Raio className="btn__bolt" />
      </Link>
    </aside>
  )
}

/**
 * CATEGORIA VAZIA — estado honesto, não erro.
 *
 * Diz o que houve e pra onde ir. Menta e não vermelho de propósito: a pessoa
 * não errou nada, e uma tarja vermelha aqui faria ela achar que o site
 * quebrou e ir embora do site inteiro, não só da categoria.
 */
export function Vazio() {
  return (
    <div className="vazio">
      <h2 className="vazio__titulo">Esta categoria está sem produto agora</h2>
      <p className="vazio__texto">
        Não é erro seu: a gente esvaziou a prateleira e ainda não repôs. Enquanto isso, o resto da
        loja continua de pé.
      </p>
      <Link className="btn" href="/produtos">
        Ver todos os produtos
        <Raio className="btn__bolt" />
      </Link>
    </div>
  )
}

/**
 * O RESTO DA LOJA — a saída de quem caiu numa categoria magra ou vazia.
 *
 * Mesma peça de card, então não há desenho novo pra manter. No desktop é
 * grade de quatro (uma linha cheia); no celular é faixa que rola, porque lá
 * o card cortado no meio é justamente o sinal de que dá pra arrastar.
 */
export function Resto({
  produtos,
  nome,
  quantosNaTela,
}: {
  produtos: HttpTypes.StoreProduct[]
  nome: string
  quantosNaTela: number
}) {
  if (!produtos.length) return null

  return (
    <section className="resto" aria-labelledby="resto-titulo">
      <h2 className="resto__titulo" id="resto-titulo">
        <Raio aria-hidden="true" />O resto da loja
      </h2>
      <p className="resto__linha">
        {quantosNaTela === 0
          ? "O que continua em pé, das outras categorias:"
          : `${quantosNaTela === 1 ? "Só um produto" : `Só ${quantosNaTela} produtos`} em ${nome} por enquanto. O que mais tem na loja:`}
      </p>
      <div className="resto__faixa">
        {produtos.map((produto) => (
          <CartaoProduto key={produto.id} produto={produto} />
        ))}
      </div>
    </section>
  )
}
