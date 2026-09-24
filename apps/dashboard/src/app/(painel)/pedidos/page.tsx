import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { BuscaEFiltros, ListaDosPedidos } from "@/components/pedidos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { medusa } from "@/lib/medusa"
import { ehFiltro, type ListaDePedidos } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Pedidos" }

type Busca = Promise<{ filtro?: string; busca?: string }>

/**
 * PEDIDOS — a lista, com a busca e as fitas de filtro no endereço
 * (`?filtro=despachar&busca=rafael`): o botão voltar do celular volta pro
 * filtro de antes, e o link do Início ("pedidos pra despachar") abre filtrado.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="pedidos">
      <Lista searchParams={searchParams} />
    </SoPara>
  )
}

async function Lista({ searchParams }: { searchParams: Busca }) {
  const { filtro, busca } = await searchParams
  const q = new URLSearchParams()
  if (ehFiltro(filtro)) q.set("filtro", filtro)
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 80))

  const r = await medusa(`/dashboard/pedidos?${q}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="pedidos" />
  if (r.status !== 200) return <ForaDoAr />
  const lista = r.corpo as unknown as ListaDePedidos

  return (
    <div data-tela>
      <Cabeca
        titulo="Pedidos"
        sub="A loja cobra, emite a nota, manda pra Frenet e avisa o cliente sozinha. Aqui você vê onde cada pedido está — e o que travou."
      />
      <BuscaEFiltros lista={lista} />
      <section className="bloco bloco--sem-pad">
        <ListaDosPedidos pedidos={lista.pedidos} />
      </section>
      <p className="lista-nota">
        Os {lista.limite} pedidos mais recentes. Um mais antigo se acha pelo número.
      </p>
    </div>
  )
}
