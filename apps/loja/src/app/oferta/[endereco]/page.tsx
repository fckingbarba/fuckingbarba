import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { JanelaDaOferta } from "@/components/oferta/janela"
import { CartaoProduto } from "@/components/produto/cartao"
import { buscarOferta, listarProdutos } from "@/lib/medusa"
import { quandoAcaba } from "@/lib/ofertas"
// Só aqui, e não no globals.css: ver "O QUE NÃO MORA AQUI" lá.
import "@/estilos/telas/oferta.css"

/**
 * /oferta/<endereço> — A OFERTA OCULTA (`lib/ofertas.ts`): os produtos com o
 * preço de quem tem o link, o contador até o fim e o "Comprar" que marca a
 * sacola com a oferta. Criada no painel (Cupons e descontos → Ofertas
 * ocultas), que dá o link.
 *
 * ESCONDIDA: fora do menu, do sitemap e do Google (aqui o `noindex`, e o
 * `robots.ts`); o pop-up da 1ª compra não abre (`semPopupNesta`). Não
 * existe lista das ofertas em lugar nenhum da loja: sem o endereço, não se
 * chega.
 *
 * Os produtos vêm do catálogo da vitrine (a mesma leitura guardada), na
 * ordem do painel; o rascunho e o que saiu da loja ficam de fora.
 */

type Props = PageProps<"/oferta/[endereco]">

/**
 * Nenhuma oferta nasce no build (elas são criadas depois, pelo painel): a
 * lista leva um endereço que não existe, só pra rota ser feita sob pedido e
 * guardada — como a página do produto sem catálogo.
 */
export async function generateStaticParams() {
  return [{ endereco: "__nenhuma__" }]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { endereco } = await params
  const oferta = await buscarOferta(endereco)
  return {
    title: oferta ? oferta.titulo : "Oferta não encontrada",
    description: oferta
      ? (oferta.chamada ?? `Oferta só pra quem tem o link, até ${quandoAcaba(oferta.terminaEm)}.`)
      : undefined,
    robots: { index: false, follow: false },
    // A prévia do link no WhatsApp e no direct: é por lá que a oferta anda.
    openGraph: oferta
      ? { title: oferta.titulo, description: oferta.chamada ?? undefined }
      : undefined,
  }
}

/**
 * O endereço só existe na hora do pedido (nenhuma oferta nasce no build): a
 * oferta chega por streaming, atrás de uma caixa preta do tamanho da de
 * verdade — o rodapé não pula quando ela entra.
 */
export default function PaginaDaOferta({ params }: Props) {
  return (
    <main id="conteudo" className="oferta">
      <Suspense
        fallback={
          <section className="offers oferta__topo" aria-hidden="true">
            <div className="offers__box oferta__esperando" />
          </section>
        }
      >
        <Conteudo params={params} />
      </Suspense>
    </main>
  )
}

async function Conteudo({ params }: Pick<Props, "params">) {
  const { endereco } = await params
  const oferta = await buscarOferta(endereco)
  if (!oferta) notFound()

  const catalogo = new Map((await listarProdutos()).map((p) => [p.id, p]))
  const produtos = oferta.produtos.flatMap((item) => {
    const p = catalogo.get(item.id)
    return p ? [{ produto: p, por: item.por }] : []
  })

  return (
    <div className="oferta__miolo" data-oferta={oferta.endereco}>
      <JanelaDaOferta oferta={oferta}>
        <section className="oferta__produtos" aria-label="Produtos da oferta">
          <div className="oferta__grade">
            {produtos.map(({ produto, por }, i) => (
              <CartaoProduto
                key={produto.id}
                produto={produto}
                prioridade={i < 4}
                destaque={i === 0}
                oferta={{ endereco: oferta.endereco, por }}
              />
            ))}
          </div>
          <p className="oferta__nota">
            Esse preço é só pra quem abriu este link, e já aparece assim na sacola. Levando 2 ou 3
            do mesmo produto, vale o menor preço entre a oferta e o desconto por quantidade.
          </p>
        </section>
      </JanelaDaOferta>
    </div>
  )
}
