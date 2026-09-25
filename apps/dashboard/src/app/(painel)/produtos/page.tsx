import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { FiltrosDosProdutos, ListaDosProdutos } from "@/components/produtos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { medusa } from "@/lib/medusa"
import { ehFiltroDeProduto, type ListaDeProdutos } from "@/lib/produtos"

export const metadata: Metadata = { title: "Produtos" }

type Busca = Promise<{ filtro?: string }>

/**
 * PRODUTOS — a lista, com as fitas de filtro no endereço (`?filtro=rascunho`).
 * Preço e estoque vêm do Bling e só aparecem; a promoção (o "por" do
 * de/por) se muda aqui mesmo, no preço de cada um. O resto do que se edita
 * fica na página de cada produto.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="produtos">
      <Lista searchParams={searchParams} />
    </SoPara>
  )
}

async function Lista({ searchParams }: { searchParams: Busca }) {
  const { filtro } = await searchParams
  const q = ehFiltroDeProduto(filtro) ? `?filtro=${filtro}` : ""

  const r = await medusa(`/dashboard/produtos${q}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="produtos" />
  if (r.status !== 200) return <ForaDoAr />
  const lista = r.corpo as unknown as ListaDeProdutos

  return (
    <div data-tela>
      <Cabeca
        titulo="Produtos"
        sub={
          <>
            Nome, descrição, preço, peso e medidas vêm do <b>Bling</b>: mudam lá e chegam quando
            alguém traz o catálogo de novo. O estoque vem sozinho, de 5 em 5 minutos. Aqui ficam a
            promoção (o &ldquo;de/por&rdquo;, no preço de cada um), o subtítulo, a categoria, a
            página do produto e o que está no site.
          </>
        }
      />
      <FiltrosDosProdutos lista={lista} />
      <section className="bloco bloco--sem-pad">
        <ListaDosProdutos produtos={lista.produtos} podeEditar={lista.podeEditar} />
      </section>
    </div>
  )
}
