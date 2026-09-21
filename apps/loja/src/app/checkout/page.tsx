import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Etapas } from "@/components/checkout/etapas"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { Cadeado, Raio } from "@/components/icones"
import { LogoCurta } from "@/components/marca"
import {
  lerBump,
  lerCheckout,
  listarFretes,
  listarProvedores,
  listarSugestoes,
} from "@/lib/checkout"
import { carrinhoFechado } from "@/lib/carrinho"
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
      {/* Tira a carcaça da loja (cabeçalho, esteira, rodapé) e põe o fundo
          cinza enquanto esta página está na tela — `checkout-loja.css`. */}
      <MarcaDaTela tela="checkout" />

      {/*
        Cabeçalho próprio, e curto. O da loja tem menu, busca e sacola — três
        saídas no meio de uma compra. Aqui ficam a marca (que volta pra loja,
        pra quem desistiu ter por onde) e o cadeado.
      */}
      <header className="topo">
        <div className="topo__wrap">
          {/* A mesma marca do cabeçalho da loja, sozinha. O nome sai do
              `aria-label` pra quem lê a tela. */}
          <Link className="topo__logo" href="/" aria-label={`${site.nome} — voltar pra loja`}>
            <LogoCurta aria-hidden="true" />
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

  // Carrinho que já virou pedido, com a confirmação perdida no caminho: vai
  // buscar o pedido em vez de dizer "sacola vazia" — senão a pessoa compra
  // de novo. Ver `/checkout/retomar`.
  if (!checkout && (await carrinhoFechado())) redirect("/checkout/retomar")
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
  /*
    ESTA É A LINHA QUE O COMENTÁRIO ANTIGO PREVIU QUE MUDARIA.

    Enquanto o frete era fixo, as opções existiam antes do CEP e vinham
    sempre. Agora elas são cotação ao vivo: sem CEP no carrinho não há preço
    a pedir, e chamar assim só rende um erro no log a cada abertura do
    checkout.

    Então aqui ele só cota quem JÁ tem endereço — quem voltou pro checkout
    com o carrinho de antes. Pra quem está chegando agora, quem traz as
    opções é o `consultarCep`, no instante em que o CEP é digitado.
  */
  const fretes = checkout.entrega.cep ? await listarFretes(checkout.id) : []
  const provedores = await listarProvedores(checkout.regiaoId)
  const bump = await lerBump(checkout.regiaoId, jaNoCarrinho, checkout.bumpMarcado)
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
        Ou a compra já foi fechada — e aí o pedido está na tela de confirmação que abriu depois do
        pagamento —, ou o carrinho expirou, e nada foi cobrado.
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
