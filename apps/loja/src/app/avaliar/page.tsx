import type { Metadata } from "next"
import { Suspense } from "react"
import { Avaliar } from "@/components/avaliar/avaliar"
import { AvaliarDireto } from "@/components/avaliar/direto"
import { OutroPedido } from "@/components/avaliar/outro-pedido"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { lerLinkDaAvaliacao, lerPedidoDaAvaliacao, produtosParaAvaliar } from "@/lib/avaliar"
// Os campos e o bloco são os do checkout e da conta (.bloco, .campo, .giro):
// quem preenche aqui preencheu lá, e a cara tem que ser a mesma.
import "@/estilos/telas/avaliar.css"

/**
 * /avaliar — A PÁGINA ESCONDIDA DA AVALIAÇÃO. Sem conta: quem abre pelo
 * botão do e-mail "o que você achou?" (um dia depois da entrega) chega com
 * o link do pedido num cookie (`app/avaliar/[link]/route.ts`), e a página
 * já sabe o número, o nome e os produtos. Falta só a nota e o texto.
 *
 * Sem o link (o endereço que a loja manda pelo WhatsApp, a pessoa que apagou
 * o e-mail, quem comprou na loja antiga), é um formulário só: o número do
 * pedido, o e-mail da compra, o nome, o produto (da lista da loja inteira),
 * as estrelas e o texto. O Medusa confere o pedido no envio, na loja nova ou
 * na base da Nuvemshop, e a página nunca mostra nada dele.
 *
 * ESCONDIDA: fora do menu, do sitemap e do Google (o `Disallow` do robots e
 * o `noindex` daqui). O endereço sozinho não abre pedido de ninguém.
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
                <span className="giro" aria-hidden="true" /> Abrindo a avaliação…
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
  const doEndereco = typeof produto === "string" ? produto : null
  const link = await lerLinkDaAvaliacao()
  if (!link) return <SemLink produto={doEndereco} />

  const leitura = await lerPedidoDaAvaliacao(link)
  if (leitura.tipo === "invalido") {
    return (
      <SemLink
        produto={doEndereco}
        recado="Não encontrei o pedido desse link. Preencha com o número do pedido e o e-mail da compra."
      />
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
  return <Avaliar pedido={leitura.pedido} escolhido={doEndereco} />
}

/**
 * O formulário sem o link, com os produtos da loja. `?produto=` (o id ou o
 * endereço do produto) abre com ele marcado — dá pra mandar
 * `/avaliar?produto=oleo-para-barba` pra quem comprou o óleo.
 */
async function SemLink({ produto, recado }: { produto: string | null; recado?: string }) {
  const produtos = await produtosParaAvaliar()
  const escolhido = produto
    ? (produtos.find((p) => p.id === produto || p.handle === produto)?.id ?? null)
    : null
  return <AvaliarDireto produtos={produtos} escolhido={escolhido} recado={recado} />
}
