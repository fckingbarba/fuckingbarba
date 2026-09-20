import type { Metadata } from "next"
import { Suspense } from "react"
import { Grade, Vazio } from "@/components/catalogo/grade"
import { Ordena } from "@/components/catalogo/ordena"
import { Trilhos } from "@/components/catalogo/trilhos"
import { Raio } from "@/components/icones"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import { lerOrdem, ordenar, prateleiras } from "@/lib/catalogo"
import { listarProdutos } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * /produtos — a loja inteira, sem filtro de categoria.
 *
 * É a MESMA tela de `/[categoria]`, com duas diferenças: não filtra, e não
 * tem convite nem "resto da loja" (aqui não existe resto — isto é o resto).
 * Reaproveita os mesmos componentes de propósito: uma segunda grade de
 * produtos, escrita à parte, seria a primeira a ficar para trás na próxima
 * mudança de desenho.
 *
 * Ela existe porque o botão "Ver todos os produtos" da home apontava pro
 * `/em-breve`. Página que promete e entrega `/em-breve` ensina a não clicar
 * nos outros botões.
 */

type Props = PageProps<"/produtos">

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: `Tudo que a ${site.nome} tem hoje: barba, cabelo e kits, numa lista só.`,
  // Mesma razão da tela de categoria: `?ordem=` é a mesma lista embaralhada.
  alternates: { canonical: "/produtos" },
}

export default function PaginaProdutos({ searchParams }: Props) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  )
}

async function Conteudo({ searchParams }: Pick<Props, "searchParams">) {
  const ordem = lerOrdem((await searchParams).ordem)

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

function Esqueleto() {
  return (
    <main className="catalogo" id="conteudo">
      <div className="catalogo__wrap animate-pulse" aria-hidden="true">
        <div className="h-14 w-72 bg-tinta/10" />
        <div className="catalogo__grade mt-10">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] border-2 border-tinta/20 bg-papel/60" />
          ))}
        </div>
      </div>
    </main>
  )
}
