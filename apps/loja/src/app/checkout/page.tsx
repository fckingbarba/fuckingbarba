import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Fragment, Suspense } from "react"
import { Etapas } from "@/components/checkout/etapas"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { RecarregaSacola } from "@/components/sacola/recarrega"
import { Cadeado, Raio } from "@/components/icones"
import { LogoCurta } from "@/components/marca"
import {
  lerBump,
  lerCheckout,
  listarFretes,
  listarProvedores,
  listarSugestoes,
  preencherDaConta,
} from "@/lib/checkout"
import { carrinhoFechado } from "@/lib/carrinho"
import { faltaPraGratis } from "@/lib/checkout-visivel"
import { site } from "@/lib/site"
import { configuracoes } from "@/lib/medusa"
// Só no checkout e na conta, e não no globals.css: ver "O QUE NÃO MORA AQUI" lá.
import "@/estilos/telas/checkout-e-conta.css"

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

export default function Pagina({ searchParams }: PageProps<"/checkout">) {
  return (
    <>
      {/* Tira a carcaça da loja (cabeçalho, esteira, rodapé) e põe o fundo
          cinza enquanto esta página está na tela — `checkout-loja.css`. */}
      <MarcaDaTela tela="checkout" />
      {/* Quem sai do checkout pra loja encontra o cabeçalho com a sacola de
          agora — a oferta e os chips daqui mexem nela por fora da gaveta. */}
      <RecarregaSacola quando="sair" />

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

      {/* Na gravação da Clarity, o que a pessoa digita e o resumo ficam cobertos. */}
      <main className="pagina" id="conteudo" data-clarity-mask="true">
        <Suspense fallback={<Esqueleto />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  )
}

async function Conteudo({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  // Com a conta aberta: o carrinho passa pro nome dela, e o que estiver
  // vazio vem de "Meus dados" e do endereço principal. Antes de ler — é o
  // carrinho já preenchido que decide em que passo o checkout abre.
  await preencherDaConta()
  const checkout = await lerCheckout()

  // Carrinho que já virou pedido, com a confirmação perdida no caminho: vai
  // buscar o pedido em vez de dizer "sacola vazia" — senão a pessoa compra
  // de novo. Ver `/checkout/retomar`. Se de lá voltou sem pedido, fica aqui,
  // com o recado: mandar de novo era o laço de 24/09.
  if (!checkout && (await carrinhoFechado())) {
    if ((await searchParams).retomar === "falhou") return <PedidoSemConfirmacao />
    redirect("/checkout/retomar")
  }
  if (!checkout || checkout.itens.length === 0) return <Vazio />

  /*
    O piso vem do Medusa, não de constante: é o MESMO número que a regra de
    preço do frete usa pra decidir se zera. Enquanto eram dois números em
    dois arquivos, o checkout podia dizer "faltam R$ 20 pro frete grátis" e
    o Medusa cobrar frete mesmo assim.

    `piso: 0` quando não há promoção — os chips de "complete o frete grátis"
    somem sozinhos, porque não falta nada pra uma promoção que não existe.
  */
  const { frete: politica, atendimento } = await configuracoes()
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
  const fretes = checkout.entrega.cep
    ? await listarFretes(checkout.id, checkout.freteEscolhido)
    : []
  const provedores = await listarProvedores(checkout.regiaoId)
  const bump = await lerBump(checkout)
  const sugestoes = await listarSugestoes(checkout, falta)

  return (
    <Etapas
      checkout={checkout}
      fretes={fretes}
      provedores={provedores}
      bump={bump}
      sugestoes={sugestoes}
      falta={falta}
      piso={piso}
      atendimento={atendimento}
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
 * A sacola já virou pedido, mas o pedido não se deixou achar agora (o Medusa
 * fora do ar, quase sempre). Não é "sacola vazia" — ela foi comprada —, e
 * mandar comprar de novo seria a compra dupla que o `/checkout/retomar`
 * existe pra evitar.
 */
function PedidoSemConfirmacao() {
  return (
    <div className="bloco checkout__vazio">
      <h1>Essa sacola já virou pedido</h1>
      <p>
        Não consegui abrir a confirmação dele agora. Se o pagamento passou, ela também chega no seu
        e-mail. Tenta de novo em instantes — e, se preferir, chama a gente no WhatsApp.
      </p>
      {/* Sem prefetch: a rota grava cookie (o crachá do pedido) — buscada
          antes do clique, abriria o pedido sozinha. */}
      <Link className="btn" href="/checkout/retomar" prefetch={false}>
        Tentar de novo
        <Raio className="btn__bolt" />
      </Link>
    </div>
  )
}

/**
 * O ESQUELETO TEM A CARA DO CHECKOUT: o título, os três passos, o bloco do
 * passo com rótulo e campo, e o resumo — a barra escura e, no computador, o
 * corpo dele (no celular o resumo chega fechado). Não é enfeite: placeholder
 * baixinho que cresce quando o conteúdo chega empurra o botão pra longe do
 * dedo que já ia clicar nele, e placeholder com outra cara faz a página
 * piscar em vez de só se preencher.
 *
 * Os passos são os de verdade, vazios — o número sai do contador do CSS
 * (`.passos li::before`). Nenhum vem marcado: o checkout pode abrir no 2 ou
 * no 3, e quem decide é o carrinho, que ainda está chegando.
 */
function Esqueleto() {
  return (
    <>
      <div className="fluxo" aria-hidden="true">
        <div className="cabeca">
          <span className="esqueleto esqueleto--titulo" />
        </div>
        <ol className="passos">
          <li />
          <li />
          <li />
        </ol>
        <div className="bloco">
          <div className="bloco__topo">
            <span className="bloco__num" />
            <span className="esqueleto esqueleto--subtitulo" />
          </div>
          {[0, 1, 2].map((i) => (
            <Fragment key={i}>
              <span className="esqueleto esqueleto--etiqueta" />
              <span className="esqueleto esqueleto--campo" />
            </Fragment>
          ))}
          <span className="esqueleto esqueleto--botao" />
        </div>
      </div>
      <aside className="resumo" aria-hidden="true">
        <div className="resumo-esqueleto">
          <p className="resumo-esqueleto__barra">
            Resumo do pedido
            <span className="esqueleto esqueleto--valor" />
          </p>
          <div className="resumo-esqueleto__corpo">
            <span className="esqueleto esqueleto--linha" />
            <span className="esqueleto esqueleto--linha" />
            <span className="esqueleto esqueleto--linha esqueleto--curta" />
          </div>
        </div>
      </aside>
    </>
  )
}
