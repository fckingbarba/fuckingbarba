import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Etapas } from "@/components/checkout/etapas"
import { Cadeado, Raio } from "@/components/icones"
import {
  lerBump,
  lerCheckout,
  listarFretes,
  listarProvedores,
  listarSugestoes,
} from "@/lib/checkout"
import { faltaPraGratis } from "@/lib/checkout-visivel"
import { site } from "@/lib/site"
import { configuracoes } from "@/lib/medusa"

/**
 * /checkout — a compra, numa página só, em três passos.
 *
 * ┌─ POR QUE O CARRINHO É LIDO DENTRO DE UM <Suspense> ────────────────────┐
 * │ Com Cache Components, ler cookie fora de um boundary impede a rota de  │
 * │ ser pré-renderizada e o `next build` recusa, com um erro que fala de   │
 * │ "uncached or runtime data during prerendering". Dentro do boundary, a  │
 * │ casca (cabeçalho, título) sai estática e instantânea, e só o miolo —   │
 * │ que depende de QUEM está comprando — chega em seguida.                 │
 * │                                                                        │
 * │ Em `next dev` isso é só um aviso no overlay: a página responde 200 e   │
 * │ parece certa. Quebra no build.                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NADA AQUI É CACHEADO, e é o padrão: com Cache Components só fica em cache
 * o que pede `"use cache"`. Um checkout cacheado seria o endereço de uma
 * pessoa na tela de outra.
 */

export const metadata: Metadata = {
  title: "Finalizar compra",
  // O robots.ts já bloqueia /checkout; isto é a segunda tranca.
  robots: { index: false, follow: false },
}

export default function Pagina() {
  return (
    <>
      {/*
        Cabeçalho próprio, e curto. O da loja tem menu, busca e sacola — três
        saídas no meio de uma compra. Aqui ficam a marca (que volta pra loja,
        pra quem desistiu ter por onde) e o cadeado.
      */}
      <header className="topo">
        <div className="topo__wrap">
          <Link className="topo__logo" href="/" aria-label={`${site.nome} — voltar pra loja`}>
            <Raio aria-hidden="true" />
            {site.nome}
          </Link>
          <p className="topo__seguro">
            <Cadeado aria-hidden="true" />
            <span>Checkout seguro</span>
          </p>
          <Link className="topo__voltar" href="/">
            Voltar pra loja
          </Link>
        </div>
      </header>

      <main className="pagina" id="conteudo">
        <Suspense fallback={<Esqueleto />}>
          <Conteudo />
        </Suspense>
      </main>
    </>
  )
}

async function Conteudo() {
  const checkout = await lerCheckout()

  if (!checkout || checkout.itens.length === 0) return <Vazio />

  const jaNoCarrinho = new Set(checkout.itens.map((i) => i.varianteId))

  /*
    O piso vem do Medusa, não de constante: é o MESMO número que a regra de
    preço do frete usa pra decidir se zera. Enquanto eram dois números em
    dois arquivos, o checkout podia dizer "faltam R$ 20 pro frete grátis" e
    o Medusa cobrar frete mesmo assim.

    `piso: 0` quando não há promoção — os chips de "complete o frete grátis"
    somem sozinhos, porque não falta nada pra uma promoção que não existe.
  */
  const { frete: politica } = await configuracoes()
  const piso = politica.modo === "nenhuma" ? 0 : politica.piso
  const falta = politica.modo === "nenhuma" ? 0 : faltaPraGratis(checkout, piso)

  // Em série, e não em paralelo: tudo isto conversa com o mesmo carrinho, e
  // pedir ao mesmo tempo multiplica escritas concorrentes — que é como um
  // total sobrescreve o outro.
  //
  // O frete é pedido SEM depender do endereço estar gravado. Hoje as opções
  // são nacionais e de valor fixo, então elas existem antes do CEP; quem
  // decide quando MOSTRAR é a tela, depois que o endereço abre. Quando o
  // Frenet entrar e a cotação passar a depender do CEP, esta linha é a que
  // muda — e aí ela espera o endereço.
  const fretes = await listarFretes(checkout.id)
  const provedores = await listarProvedores(checkout.regiaoId)
  const bump = await lerBump(checkout.regiaoId, jaNoCarrinho)
  const sugestoes = await listarSugestoes(checkout.regiaoId, falta, jaNoCarrinho)

  return (
    <Etapas
      checkout={checkout}
      fretes={fretes}
      provedores={provedores}
      bump={bump}
      sugestoes={sugestoes}
      falta={falta}
      piso={piso}
    />
  )
}

/**
 * Sacola vazia no checkout acontece o tempo todo: link velho, compra já
 * fechada noutra aba, cookie limpo. Não é erro — é uma pessoa no lugar
 * errado, e o que ela precisa é do caminho de volta, não de um aviso.
 */
function Vazio() {
  return (
    <div className="bloco checkout__vazio">
      <h1>Sua sacola está vazia</h1>
      <p>
        Pode ser que a compra já tenha sido fechada, ou que o carrinho tenha expirado. Os dois
        acontecem, e nenhum dos dois cobrou nada de você.
      </p>
      <Link className="btn" href="/">
        Ver os produtos
        <Raio className="btn__bolt" />
      </Link>
    </div>
  )
}

/**
 * O esqueleto tem a ALTURA do passo de verdade. Não é enfeite: placeholder
 * baixinho que cresce quando o conteúdo chega empurra o botão pra longe do
 * dedo que já ia clicar nele.
 */
function Esqueleto() {
  return (
    <>
      <div className="fluxo" aria-hidden="true">
        <div className="cabeca">
          <span className="esqueleto esqueleto--titulo" />
        </div>
        <div className="bloco">
          <span className="esqueleto esqueleto--campo" />
          <span className="esqueleto esqueleto--campo" />
          <span className="esqueleto esqueleto--botao" />
        </div>
      </div>
      <aside className="resumo" aria-hidden="true">
        <div className="bloco">
          <span className="esqueleto esqueleto--titulo" />
          <span className="esqueleto esqueleto--linha" />
          <span className="esqueleto esqueleto--linha" />
        </div>
      </aside>
    </>
  )
}
