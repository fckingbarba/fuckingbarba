import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Grade, Resto, Vazio } from "@/components/catalogo/grade"
import { Ordena } from "@/components/catalogo/ordena"
import { Trilhos } from "@/components/catalogo/trilhos"
import { Raio } from "@/components/icones"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import {
  aMaiorDasOutras,
  lerOrdem,
  oRestoDaLoja,
  ordenar,
  prateleiras,
  type HandleDeCategoria,
} from "@/lib/catalogo"
import { buscarCategoria, listarProdutos } from "@/lib/medusa"
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
 * ┌─ POR QUE A DESCRIÇÃO DA CATEGORIA NÃO APARECE ────────────────────────┐
 * │ O campo existe no Medusa e está vazio, e a tela foi aprovada sem ele: │
 * │ título, trilhos e produto, nada entre a pessoa e a grade.             │
 * │                                                                        │
 * │ O preço disso é SEO: categoria sem texto compete mal em busca contra  │
 * │ quem escreve dois parágrafos. Quando houver texto pra pôr, o lugar é  │
 * │ ABAIXO da grade — é onde a maioria das lojas põe, justamente pra não  │
 * │ empurrar o produto pra baixo da dobra.                                │
 * └────────────────────────────────────────────────────────────────────────┘
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
    /*
      CANÔNICA SEM O `?ordem`. `/barba`, `/barba?ordem=barato` e
      `/barba?ordem=caro` são a MESMA lista em ordens diferentes; sem esta
      linha o Google indexa três URLs com o mesmo conteúdo e reparte a força
      entre elas. Canônica resolve; `noindex` junto com canônica não, porque
      são dois sinais que se contradizem e o Google pede pra não combinar.
    */
    alternates: { canonical: `/${categoria}` },
  }
}

export default function PaginaCategoria({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  )
}

/**
 * `params` e `searchParams` são repassados SEM `await` daqui de cima e
 * aguardados lá dentro, dentro do `<Suspense>`. Esperar na função de fora
 * faria a página inteira esperar, e a casca deixaria de sair na hora — que
 * é o motivo de o `<Suspense>` existir com Cache Components.
 */
async function Conteudo({ params, searchParams }: Props) {
  const { categoria } = await params
  if (!ehCategoria(categoria)) notFound()

  const ordem = lerOrdem((await searchParams).ordem)

  const [dados, todas] = await Promise.all([buscarCategoria(categoria), prateleiras()])
  const nome = nomeDe(categoria, dados?.name)

  /*
    A busca desta categoria é a MESMA que já veio dentro de `prateleiras()`,
    e as duas são `"use cache"` com a mesma chave — o Medusa é consultado uma
    vez só. Ler da prateleira em vez de buscar de novo deixaria a página
    dependendo de as duas listas nunca divergirem.
  */
  const daPrateleira = todas.find((p) => p.handle === categoria)
  const produtos = ordenar(
    daPrateleira?.produtos ?? (dados ? await listarProdutos({ categoriaId: dados.id }) : []),
    ordem
  )

  const magraOuVazia = produtos.length <= 2
  const resto = magraOuVazia ? oRestoDaLoja(todas, categoria, produtos) : []

  const trilha: Migalha<"/" | `/${HandleDeCategoria}`>[] = [
    { nome: "Início", href: "/" },
    { nome },
  ]

  return (
    <>
      <Migalhas trilha={trilha} />

      <main className="catalogo" id="conteudo">
        <div className="catalogo__wrap">
          <div className="catalogo__cabeca">
            <h1 className="catalogo__titulo">
              <Raio aria-hidden="true" />
              {nome}
            </h1>
          </div>

          <Trilhos prateleiras={todas} atual={categoria} />

          {/*
            A barra some quando não há o que contar nem o que ordenar.
            Ordenar uma lista de um item é um controle que não faz nada — e
            controle que não faz nada ensina a pessoa a não confiar nos
            outros que estão na mesma tela.
          */}
          {produtos.length >= 2 ? (
            <div className="catalogo__barra">
              <p className="catalogo__contagem">
                <b>
                  {produtos.length} {produtos.length === 1 ? "produto" : "produtos"}
                </b>
                {produtos.every(temEstoque) ? " · pronta entrega" : null}
              </p>
              <Ordena ordem={ordem} />
            </div>
          ) : null}

          {produtos.length === 0 ? (
            <Vazio />
          ) : (
            <Grade
              produtos={produtos}
              maior={aMaiorDasOutras(todas, categoria)}
              nome={nome}
            />
          )}

          <Resto produtos={resto} nome={nome} quantosNaTela={produtos.length} />
        </div>
      </main>
    </>
  )
}

/**
 * Produto sem controle de estoque conta como disponível (é o que o Medusa
 * entende por `manage_inventory: false`); com controle, precisa ter peça.
 * "Pronta entrega" fala da GRADE INTEIRA, então um esgotado no meio já
 * derruba a frase — e é por isso que é `every`, não `some`.
 */
function temEstoque(produto: { variants?: unknown }): boolean {
  const variantes = (produto.variants ?? []) as {
    manage_inventory?: boolean
    inventory_quantity?: number
  }[]
  return variantes.some((v) => !v.manage_inventory || (v.inventory_quantity ?? 0) > 0)
}

function Esqueleto() {
  return (
    <main className="catalogo" id="conteudo">
      <div className="catalogo__wrap animate-pulse" aria-hidden="true">
        <div className="h-14 w-56 bg-tinta/10" />
        <div className="catalogo__grade mt-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] border-2 border-tinta/20 bg-papel/60" />
          ))}
        </div>
      </div>
    </main>
  )
}
