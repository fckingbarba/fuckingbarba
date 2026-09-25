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
 * O preço e o promocional se mudam aqui mesmo, nos dois campos de cada
 * produto; o estoque vem do Bling e só aparece. O resto do que se edita
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
            <b>Preço e promocional se mudam aqui:</b> escreva no campo e aperte Enter. Promocional
            vazio é sem promoção. O preço mudado aqui a importação do Bling não troca mais. Nome,
            descrição, peso e medidas vêm do <b>Bling</b>; o estoque, sozinho, de 5 em 5 minutos.
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
