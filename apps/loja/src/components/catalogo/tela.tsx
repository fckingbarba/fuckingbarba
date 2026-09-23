import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Grade, Resto, Vazio } from "@/components/catalogo/grade"
import { Ordena } from "@/components/catalogo/ordena"
import { Trilhos } from "@/components/catalogo/trilhos"
import { Raio } from "@/components/icones"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import {
  aMaiorDasOutras,
  oRestoDaLoja,
  ordenar,
  prateleiras,
  type HandleDeCategoria,
  type Ordem,
} from "@/lib/catalogo"
import { buscarCategoria, listarProdutos } from "@/lib/medusa"
import { ehCategoria, site } from "@/lib/site"

/**
 * A TELA DA CATEGORIA E A DA LOJA INTEIRA — o miolo de `/barba` e de
 * `/produtos`, numa ordem que vem PRONTA de quem chama.
 *
 * ┌─ POR QUE A ORDEM NÃO É LIDA AQUI ──────────────────────────────────────┐
 * │ Ler o `?ordem=` da URL (`searchParams`) tornava a página DINÂMICA: a   │
 * │ grade inteira vinha por streaming, depois da casca, atrás de um        │
 * │ esqueleto. Isso custava duas coisas medidas no Lighthouse do CI:       │
 * │   • o esqueleto nunca tinha a altura da grade, e o rodapé PULAVA        │
 * │     quando ela chegava (CLS de 0,09);                                  │
 * │   • o elemento principal da tela chegava depois dos scripts, e na      │
 * │     simulação de 4G o LCP passava de 3,3s — com o navegador de verdade │
 * │     pintando tudo em 0,15s.                                            │
 * │ Agora quem pede a ordem é a ROTA: `/barba` é a relevância, e o         │
 * │ `proxy.ts` troca `/barba?ordem=barato` por `/barba/ordem/barato`, uma  │
 * │ página estática gerada no build. O endereço que a pessoa vê continua   │
 * │ o de sempre; nenhuma das duas depende da requisição, e as duas saem    │
 * │ prontas do cache.                                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 */

function nomeDe(categoria: string, nomeDoMedusa?: string | null) {
  return nomeDoMedusa ?? site.categorias.find((c) => c.handle === categoria)?.nome ?? categoria
}

/** Os metadados da categoria — os mesmos em `/barba` e em `/barba?ordem=…`. */
export async function metadadosDaCategoria(categoria: string): Promise<Metadata> {
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

export async function TelaDaCategoria({ categoria, ordem }: { categoria: string; ordem: Ordem }) {
  if (!ehCategoria(categoria)) notFound()

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

  const trilha: Migalha<"/" | `/${HandleDeCategoria}`>[] = [{ nome: "Início", href: "/" }, { nome }]

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
            <Grade produtos={produtos} maior={aMaiorDasOutras(todas, categoria)} nome={nome} />
          )}

          <Resto produtos={resto} nome={nome} quantosNaTela={produtos.length} />
        </div>
      </main>
    </>
  )
}

/**
 * `/produtos` — a MESMA tela, com duas diferenças: não filtra, e não tem
 * convite nem "resto da loja" (aqui não existe resto — isto é o resto).
 */
export async function TelaDaLojaInteira({ ordem }: { ordem: Ordem }) {
  const [todos, todas] = await Promise.all([listarProdutos(), prateleiras()])
  const produtos = ordenar(todos, ordem)

  const trilha: Migalha<"/">[] = [{ nome: "Início", href: "/" }, { nome: "Todos os produtos" }]

  return (
    <>
      <Migalhas trilha={trilha} />

      <main className="catalogo" id="conteudo">
        <div className="catalogo__wrap">
          <div className="catalogo__cabeca">
            <h1 className="catalogo__titulo">
              <Raio aria-hidden="true" />
              Todos os produtos
            </h1>
          </div>

          <Trilhos prateleiras={todas} atual="produtos" />

          {produtos.length >= 2 ? (
            <div className="catalogo__barra">
              <p className="catalogo__contagem">
                <b>
                  {produtos.length} {produtos.length === 1 ? "produto" : "produtos"}
                </b>
              </p>
              <Ordena ordem={ordem} />
            </div>
          ) : null}

          {produtos.length === 0 ? (
            <Vazio />
          ) : (
            <Grade produtos={produtos} maior={null} nome="Todos os produtos" />
          )}
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
