import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CampoDeBusca } from "@/components/catalogo/busca"
import { Grade } from "@/components/catalogo/grade"
import { Trilhos } from "@/components/catalogo/trilhos"
import { Raio } from "@/components/icones"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import { buscar, lerBusca } from "@/lib/busca"
import { prateleiras, type Prateleira } from "@/lib/catalogo"
import { listarProdutos } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * /busca?q=… — o destino da lupa do cabeçalho.
 *
 * Quem decide o que serve é `lib/busca.ts` (sem acento, em qualquer ordem,
 * com plural e palavra pela metade — e o porquê de a peneira ser lá e não
 * no Medusa). Aqui é a tela, com as peças da `/produtos`: a mesma grade, os
 * mesmos cards e os mesmos trilhos de categoria, pra busca não virar uma
 * segunda vitrine com desenho próprio pra manter.
 *
 * `q`, e não `busca`, no endereço: é o nome que o GA4 reconhece sozinho como
 * busca interna (medição aprimorada), sem uma linha de código de analytics.
 *
 * FORA DO GOOGLE (`noindex`), mas com os links seguidos: resultado de busca
 * interna indexado é página rasa que concorre com a categoria de verdade — e
 * o Google pede explicitamente que ela fique de fora. Pelo mesmo motivo ela
 * não entra no sitemap.
 */

type Props = PageProps<"/busca">

export const metadata: Metadata = {
  title: "Busca",
  description: `Busque nos produtos da ${site.nome}.`,
  robots: { index: false, follow: true },
}

export default function PaginaBusca({ searchParams }: Props) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  )
}

async function Conteudo({ searchParams }: Pick<Props, "searchParams">) {
  const busca = lerBusca((await searchParams).q)

  // As duas leituras são as da `/produtos`, `"use cache"` lá dentro: buscar
  // não custa ida nenhuma ao Medusa depois que a lista esquentou.
  const [todos, todas] = await Promise.all([listarProdutos(), prateleiras()])
  const achados = busca ? buscar(todos, busca) : []

  const trilha: Migalha<"/">[] = [{ nome: "Início", href: "/" }, { nome: "Busca" }]

  return (
    <>
      <Migalhas trilha={trilha} />

      <main className="catalogo catalogo--por-partes" id="conteudo">
        <div className="catalogo__wrap">
          <div className="catalogo__cabeca">
            <h1 className="catalogo__titulo">
              <Raio aria-hidden="true" />
              Busca
            </h1>
          </div>

          <CampoDeBusca inicial={busca} />

          {!busca ? (
            <>
              <p className="catalogo__contagem busca__dica">
                Digite o nome do produto — ou escolha uma categoria:
              </p>
              <Trilhos prateleiras={todas} atual={null} />
            </>
          ) : achados.length ? (
            <>
              <div className="catalogo__barra">
                {/* `role="status"`: a troca de página pela busca não recarrega
                    nada, e sem isto quem usa leitor de tela não fica sabendo
                    que os resultados chegaram. */}
                <p className="catalogo__contagem" role="status">
                  <b>
                    {achados.length} {achados.length === 1 ? "produto" : "produtos"}
                  </b>{" "}
                  para “{busca}”
                </p>
              </div>
              <Grade produtos={achados} maior={null} nome="Busca" />
            </>
          ) : (
            <SemResultado busca={busca} prateleiras={todas} />
          )}
        </div>
      </main>
    </>
  )
}

/**
 * NADA ACHADO — o mesmo estado honesto da categoria vazia (`.vazio`, menta e
 * não vermelho: a pessoa não errou nada), com as duas saídas que resolvem:
 * a loja por categoria e alguém pra perguntar. Quem procurou um produto que
 * a gente não tem precisa ouvir isso de uma pessoa, não de um campo vazio.
 */
function SemResultado({ busca, prateleiras }: { busca: string; prateleiras: Prateleira[] }) {
  return (
    <>
      <div className="vazio" role="status">
        <h2 className="vazio__titulo">Nada com “{busca}” por aqui</h2>
        <p className="vazio__texto">
          Confere se escreveu certo, ou tenta uma palavra só — o nome do produto costuma bastar.
          Procurando algo que a gente não tem? <Link href="/contato">Fala com a gente</Link>.
        </p>
        <Link className="btn" href="/produtos">
          Ver todos os produtos
          <Raio className="btn__bolt" />
        </Link>
      </div>
      <Trilhos prateleiras={prateleiras} atual={null} />
    </>
  )
}

function Esqueleto() {
  return (
    <>
      {/* A faixa do caminho, vazia: a de verdade entra junto com a grade, e sem
          esta a página inteira desceria quando ela chegasse. */}
      <div className="migalhas migalhas--esqueleto" aria-hidden="true" />
      <main className="catalogo catalogo--por-partes" id="conteudo">
        <div className="catalogo__wrap animate-pulse" aria-hidden="true">
          <div className="h-14 w-48 bg-tinta/10" />
          <div className="mt-6 h-12 max-w-[640px] border-2 border-tinta/20 bg-papel/60" />
          <div className="catalogo__grade mt-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] border-2 border-tinta/20 bg-papel/60" />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
