import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Logo } from "@/components/marca/logo"
import { buscarCategoria, listarProdutos, precoDe } from "@/lib/medusa"
import { ehCategoria, site } from "@/lib/site"

/**
 * /barba, /cabelo, /kits — categoria no primeiro nível da URL.
 *
 * A lista de handles válidos é a de `site.categorias` e bate com os handles
 * criados pelo seed do Medusa. As três são pré-renderizadas no build.
 *
 * Caminho de primeiro nível que não é categoria nem página estática nunca
 * chega aqui: o proxy.ts reescreve pra /nao-encontrado, que responde 404 de
 * verdade. (Com Cache Components toda rota dinâmica manda o shell com 200
 * antes de saber se o conteúdo existe; o `notFound()` abaixo é só a rede de
 * segurança, e sai com meta noindex.)
 *
 * FASE 3: grade com filtros, ordenação, paginação `?pagina=2` com canonical
 * próprio e `noindex` em combinação de filtro (seção SEO).
 */

type Props = PageProps<"/[categoria]">

export function generateStaticParams() {
  return site.categorias.map((c) => ({ categoria: c.handle }))
}

function nomeDe(categoria: string, nomeDoMedusa?: string | null) {
  return nomeDoMedusa ?? site.categorias.find((c) => c.handle === categoria)?.nome ?? categoria
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params
  if (!ehCategoria(categoria)) return { title: "Página não encontrada", robots: { index: false } }
  const dados = await buscarCategoria(categoria)
  const nome = nomeDe(categoria, dados?.name)
  return {
    title: `${nome} — produtos pra ${nome.toLowerCase()}`,
    // `||` de propósito: o Medusa devolve "" (não null) quando não há descrição.
    description: dados?.description || `${nome}: os produtos ${site.nome} pra sua rotina.`,
    alternates: { canonical: `/${categoria}` },
  }
}

export default function PaginaCategoria({ params }: Props) {
  return (
    <>
      <div className="faixa-perigo h-3 w-full" aria-hidden="true" />
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <Suspense fallback={<EsqueletoLista />}>
          <Categoria params={params} />
        </Suspense>
      </main>
    </>
  )
}

async function Categoria({ params }: Pick<Props, "params">) {
  const { categoria } = await params
  if (!ehCategoria(categoria)) notFound()

  const dados = await buscarCategoria(categoria)
  const nome = nomeDe(categoria, dados?.name)
  const produtos = dados ? await listarProdutos({ categoriaId: dados.id }) : []

  return (
    <>
      <h1 className="titulo-marca text-5xl text-tinta sm:text-6xl">{nome}</h1>
      {dados?.description ? (
        <p className="mt-3 max-w-prose text-lg text-tinta">{dados.description}</p>
      ) : null}

      {produtos.length === 0 ? (
        <p className="mt-10 inline-block border-2 border-dashed border-tinta/40 bg-papel/60 px-4 py-3 font-bold text-tinta">
          Os produtos desta categoria entram na fase 2 (importação do catálogo).
        </p>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {produtos.map((p) => {
            const preco = precoDe(p)
            return (
              <li key={p.id}>
                <Link
                  href={`/produtos/${p.handle}`}
                  className="chanfro-sm block border-2 border-tinta bg-papel shadow-dura-sm transition-transform duration-150 ease-suave hover:-translate-y-0.5"
                >
                  <div className="border-b-2 border-tinta bg-papel p-2">
                    {p.thumbnail ? (
                      <Image
                        src={p.thumbnail}
                        alt={p.title}
                        width={600}
                        height={600}
                        sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                        className="aspect-square h-auto w-full bg-cinza object-contain"
                      />
                    ) : (
                      <div className="aspect-square w-full bg-cinza" aria-hidden="true" />
                    )}
                  </div>
                  <div className="p-3">
                    <h2 className="text-sm font-bold leading-tight text-tinta">{p.title}</h2>
                    {preco ? <p className="mt-1 font-extrabold text-tinta">{preco}</p> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function EsqueletoLista() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-14 w-56 bg-tinta/10" />
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] border-2 border-tinta/20 bg-papel/60" />
        ))}
      </div>
    </div>
  )
}
