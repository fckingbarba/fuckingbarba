import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Etapas } from "@/components/checkout/etapas"
import { lerCheckout, listarFretes, listarProvedores } from "@/lib/checkout"

/**
 * /checkout — a compra, numa página só.
 *
 * ┌─ POR QUE O CARRINHO É LIDO DENTRO DE UM <Suspense> ────────────────────┐
 * │ Com Cache Components, ler cookie fora de um boundary impede a rota de  │
 * │ ser pré-renderizada e o `next build` recusa, com um erro que fala de   │
 * │ "uncached or runtime data during prerendering". Dentro do boundary, a  │
 * │ casca (título, passos, selos) sai estática e instantânea, e só o       │
 * │ miolo — que depende de QUEM está comprando — chega em seguida.         │
 * │                                                                        │
 * │ Em `next dev` isso só aparece como aviso no overlay: a página responde │
 * │ 200 e parece certa. Quebra no build. Por isso o conferidor desta       │
 * │ etapa roda contra `next build`, não contra `next dev`.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NADA AQUI É CACHEADO, e é o comportamento padrão: com Cache Components só
 * fica em cache o que pede `"use cache"`. Um checkout cacheado seria o
 * endereço de uma pessoa na tela de outra.
 */

export const metadata: Metadata = {
  title: "Finalizar compra",
  // Checkout não é página de busca, e a de obrigado menos ainda. O robots.ts
  // já bloqueia /checkout; isto é a segunda tranca, pro caso de alguém linkar.
  robots: { index: false, follow: false },
}

export default function Pagina() {
  return (
    <main className="checkout" id="conteudo">
      <div className="checkout__wrap">
        <h1 className="checkout__titulo">Finalizar compra</h1>

        <Suspense fallback={<Esqueleto />}>
          <Conteudo />
        </Suspense>
      </div>
    </main>
  )
}

async function Conteudo() {
  const checkout = await lerCheckout()

  if (!checkout || checkout.itens.length === 0) return <Vazio />

  // Em série, e não em paralelo, de propósito: as opções de frete dependem do
  // endereço e do valor do carrinho, então pedir as duas coisas ao mesmo tempo
  // não economiza nada de verdade e multiplica as escritas concorrentes no
  // mesmo carrinho, que é como um total sobrescreve o outro.
  const fretes = checkout.entrega.cep ? await listarFretes(checkout.id) : []
  const provedores = await listarProvedores(checkout.regiaoId)

  return <Etapas checkout={checkout} fretes={fretes} provedores={provedores} />
}

/**
 * Sacola vazia no checkout acontece o tempo todo: link velho, compra já
 * fechada noutra aba, cookie limpo. Não é erro — é uma pessoa no lugar errado,
 * e o que ela precisa é do caminho de volta, não de um aviso.
 */
function Vazio() {
  return (
    <div className="checkout__vazio">
      <h2>Sua sacola está vazia</h2>
      <p>
        Pode ser que a compra já tenha sido fechada, ou que o carrinho tenha expirado. Os dois
        acontecem, e nenhum dos dois cobrou nada de você.
      </p>
      <Link className="btn" href="/">
        Ver os produtos
      </Link>
    </div>
  )
}

/**
 * O esqueleto tem a ALTURA das etapas de verdade. Não é enfeite: placeholder
 * baixinho que cresce quando o conteúdo chega empurra o botão pra longe do
 * dedo que já ia clicar nele.
 */
function Esqueleto() {
  return (
    <div className="checkout__grade" aria-hidden="true">
      <div className="checkout__etapas">
        {[0, 1, 2, 3].map((i) => (
          <div className="etapa etapa--esqueleto" key={i}>
            <div className="etapa__cabeca">
              <span className="etapa__numero">{i + 1}</span>
              <span className="esqueleto esqueleto--titulo" />
            </div>
            {i === 0 ? (
              <div className="etapa__corpo">
                <span className="esqueleto esqueleto--campo" />
                <span className="esqueleto esqueleto--campo" />
                <span className="esqueleto esqueleto--botao" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="resumo resumo--esqueleto">
        <span className="esqueleto esqueleto--titulo" />
        <span className="esqueleto esqueleto--linha" />
        <span className="esqueleto esqueleto--linha" />
        <span className="esqueleto esqueleto--linha" />
      </div>
    </div>
  )
}
