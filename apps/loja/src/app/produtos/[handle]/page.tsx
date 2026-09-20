import type { Metadata } from "next"
import { Suspense } from "react"
import { Secoes } from "@/components/secoes"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * /produtos/<handle> — a URL em português que o SEO pede. O Medusa só guarda
 * o handle; quem monta o caminho é esta rota.
 *
 * A PÁGINA NÃO SABE QUAIS SEÇÕES EXISTEM, e isso é o ponto: ela pede
 * `<Secoes escopo="produto">` e o registro (`lib/secoes/registro.ts`) decide
 * o quê e em que ordem. Ligar, desligar e reordenar seção vira dado — que é
 * o que o painel vai mexer, sem tocar em JSX.
 *
 * Sobre 404: com Cache Components o shell (cabeçalho) sai com status 200
 * antes de o produto ser lido; produto inexistente vira not-found com meta
 * noindex (soft 404, que o Google não indexa). Um 404 de status real exige
 * checar a existência no proxy — quando o catálogo estiver estável, o proxy
 * passa a comparar o handle com a lista gerada no build.
 *
 * A FAZER: `generateStaticParams` com os handles do catálogo, pra
 * pré-renderizar no build. Com Cache Components ele precisa devolver pelo
 * menos um handle, então entra junto com a virada do catálogo.
 */

type Props = PageProps<"/produtos/[handle]">

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const produto = await buscarProdutoPorHandle(handle)
  if (!produto) return { title: "Produto não encontrado", robots: { index: false } }
  return {
    title: produto.title,
    description:
      produto.description?.slice(0, 155) ||
      `${produto.title}${produto.subtitle ? ` — ${produto.subtitle}` : ""}. Compre na FuckingBarba.`,
    alternates: { canonical: `/produtos/${produto.handle}` },
    openGraph: produto.thumbnail ? { images: [{ url: produto.thumbnail }] } : undefined,
  }
}

export default function PaginaProduto({ params }: Props) {
  return (
    <main id="conteudo" className="flex-1">
      <Suspense fallback={<EsqueletoDaDobra />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  )
}

async function Conteudo({ params }: Pick<Props, "params">) {
  const { handle } = await params
  return <Secoes escopo="produto" handle={handle} />
}

/**
 * O esqueleto tem as MESMAS medidas da dobra: mesma grade, mesma proporção
 * de foto, mesma altura de botão. Um retângulo genérico no lugar certo
 * custaria o mesmo e faria a página pular quando o conteúdo chegasse — que é
 * exatamente o que o Cache Components existe pra evitar.
 */
function EsqueletoDaDobra() {
  return (
    <section className="pdp" aria-hidden="true">
      <div className="pdp__wrap animate-pulse">
        <div className="pdp__cabeca">
          <div className="h-10 w-3/4 bg-tinta/10" />
        </div>
        <div className="galeria">
          <div className="galeria__palco bg-tinta/5" />
        </div>
        <div className="compra space-y-4">
          <div className="h-10 w-40 bg-tinta/10" />
          <div className="h-24 w-full bg-tinta/10" />
          <div className="h-14 w-full bg-tinta/10" />
        </div>
      </div>
    </section>
  )
}
