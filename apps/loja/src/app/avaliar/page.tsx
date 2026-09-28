import type { Metadata } from "next"
import { Suspense } from "react"
import { Avaliar } from "@/components/avaliar/avaliar"
import { Encontrar } from "@/components/avaliar/encontrar"
import { OutroPedido } from "@/components/avaliar/outro-pedido"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { lerLinkDaAvaliacao, lerPedidoDaAvaliacao } from "@/lib/avaliar"
// Os campos e o bloco são os do checkout e da conta (.bloco, .campo, .giro):
// quem preenche aqui preencheu lá, e a cara tem que ser a mesma.
import "@/estilos/telas/avaliar.css"

/**
 * /avaliar — A PÁGINA ESCONDIDA DA AVALIAÇÃO. Sem conta: quem abre pelo
 * botão do e-mail "o que você achou?" (um dia depois da entrega) chega com
 * o link do pedido num cookie (`app/avaliar/[link]/route.ts`), e a página
 * já sabe o número, o nome e os produtos. Falta só a nota e o texto.
 *
 * Sem o link (a pessoa apagou o e-mail, ou recebeu a página por outro
 * caminho), a página pede o número do pedido e o e-mail da compra — e o link
 * vai de novo pra esse e-mail, nunca pra tela.
 *
 * ESCONDIDA: fora do menu, do sitemap e do Google (o `Disallow` do robots e
 * o `noindex` daqui). O que vale é o link — o endereço sozinho não abre
 * pedido de ninguém.
 */
export const metadata: Metadata = {
  title: "Avaliar o pedido",
  robots: { index: false, follow: false },
}

export default function Pagina({ searchParams }: PageProps<"/avaliar">) {
  return (
    <main className="avaliar" id="conteudo" data-clarity-mask="true">
      <MarcaDaTela tela="avaliar" />
      <div className="avaliar__wrap">
        <Suspense
          fallback={
            <section className="bloco avaliar__bloco" aria-busy="true">
              <p className="avaliar__espera">
                <span className="giro" aria-hidden="true" /> Abrindo o seu pedido…
              </p>
            </section>
          }
        >
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  )
}

/** Dentro do `<Suspense>` porque lê o cookie e a URL. */
async function Conteudo({ searchParams }: { searchParams: PageProps<"/avaliar">["searchParams"] }) {
  const { produto } = await searchParams
  const link = await lerLinkDaAvaliacao()
  if (!link) return <Encontrar />

  const leitura = await lerPedidoDaAvaliacao(link)
  if (leitura.tipo === "invalido") {
    return (
      <Encontrar recado="Não encontrei o pedido desse link. Procure pelo número e o e-mail da compra." />
    )
  }
  if (leitura.tipo === "nao-aceita") {
    return (
      <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
        <h1 id="t-avaliar">Avaliar o pedido</h1>
        <p className="avaliar__txt">
          Esse pedido não aceita avaliação: ele foi cancelado ou ainda não foi pago.
        </p>
        <OutroPedido />
      </section>
    )
  }
  if (leitura.tipo === "fora") {
    return (
      <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
        <h1 id="t-avaliar">Avaliar o pedido</h1>
        <p className="avaliar__txt" role="alert">
          Não consegui abrir o seu pedido agora. Recarregue a página em instantes.
        </p>
      </section>
    )
  }
  return (
    <Avaliar pedido={leitura.pedido} escolhido={typeof produto === "string" ? produto : null} />
  )
}
