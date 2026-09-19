import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Logo } from "@/components/marca/logo"
import { buscarProdutoPorHandle, precoDe } from "@/lib/medusa"

/**
 * /produtos/<handle> — a URL em português que o SEO pede. O Medusa só guarda
 * o handle; quem monta o caminho é esta rota.
 *
 * FASE 1: esqueleto que já lê o produto real, cacheado por tag
 * (`produto:<handle>`), pra provar o caminho Vercel → Medusa. A página de
 * produto de verdade (galeria, ficha, comprar, avaliações, JSON-LD completo)
 * entra na fase 3.
 *
 * Sobre 404: com Cache Components o shell (cabeçalho) sai com status 200
 * antes de o produto ser lido; produto inexistente vira not-found com meta
 * noindex (soft 404, que o Google não indexa). Um 404 de status real exige
 * checar a existência no proxy — na fase 3, com o catálogo carregado, o
 * proxy passa a comparar o handle com a lista gerada no build.
 *
 * FASE 3: adicionar `generateStaticParams` com os handles do catálogo pra
 * pré-renderizar no build (ISR). Com Cache Components ele precisa devolver
 * pelo menos um handle, por isso não está aqui enquanto o catálogo é vazio.
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
    <>
      <div className="faixa-perigo h-3 w-full" aria-hidden="true" />
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <Suspense fallback={<EsqueletoProduto />}>
          <Produto params={params} />
        </Suspense>
      </main>
    </>
  )
}

async function Produto({ params }: Pick<Props, "params">) {
  const { handle } = await params
  const produto = await buscarProdutoPorHandle(handle)
  if (!produto) notFound()

  const preco = precoDe(produto)
  const categoria = produto.categories?.[0]

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <div className="chanfro border-2 border-tinta bg-papel p-2">
        {produto.thumbnail ? (
          <Image
            src={produto.thumbnail}
            alt={produto.title}
            width={900}
            height={900}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="h-auto w-full bg-cinza object-contain"
          />
        ) : (
          <div className="aspect-square w-full bg-cinza" aria-hidden="true" />
        )}
      </div>

      <div>
        {categoria ? (
          <Link
            href={`/${categoria.handle}`}
            className="text-xs font-extrabold uppercase tracking-[0.18em] text-tinta"
          >
            {categoria.name}
          </Link>
        ) : null}
        <h1 className="titulo-marca mt-2 text-4xl text-tinta sm:text-5xl">{produto.title}</h1>
        {produto.subtitle ? <p className="mt-2 text-lg text-tinta">{produto.subtitle}</p> : null}
        {preco ? <p className="mt-6 text-3xl font-extrabold text-tinta">{preco}</p> : null}
        {produto.description ? (
          <p className="mt-6 max-w-prose leading-relaxed text-tinta">{produto.description}</p>
        ) : null}
        <p className="mt-8 inline-block border-2 border-dashed border-tinta/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tinta">
          Botão de compra, galeria e avaliações entram na fase 3
        </p>
      </div>
    </article>
  )
}

function EsqueletoProduto() {
  return (
    <div className="grid animate-pulse gap-8 md:grid-cols-2" aria-hidden="true">
      <div className="aspect-square border-2 border-tinta/20 bg-papel/60" />
      <div className="space-y-4">
        <div className="h-4 w-24 bg-tinta/10" />
        <div className="h-12 w-3/4 bg-tinta/10" />
        <div className="h-8 w-32 bg-tinta/10" />
        <div className="h-24 w-full bg-tinta/10" />
      </div>
    </div>
  )
}
