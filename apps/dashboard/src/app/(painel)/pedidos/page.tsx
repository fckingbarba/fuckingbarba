import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Paginas } from "@/components/paginas"
import { BuscaEFiltros, enderecoDaLista, ListaDosPedidos } from "@/components/pedidos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"
import { ehFiltro, type ListaDePedidos } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Pedidos" }

type Busca = Promise<{ filtro?: string; busca?: string; pagina?: string }>

/**
 * PEDIDOS — a lista, com a busca, as fitas de filtro e a página no endereço
 * (`?filtro=despachar&busca=rafael&pagina=2`): o botão voltar do celular
 * volta pro filtro de antes, e o link do Início ("pedidos pra despachar")
 * abre filtrado. De 30 em 30 (`lib/painel/paginas.ts`, no backend).
 *
 * A leitura sai ANTES do `SoPara`, junto com a pergunta de quem é (`ler`).
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { filtro, busca, pagina } = await searchParams
  const q = new URLSearchParams()
  if (ehFiltro(filtro)) q.set("filtro", filtro)
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 80))
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/pedidos?${q}`
  void ler(caminho)
  return (
    <SoPara area="pedidos">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

async function Lista({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
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
      {lista.paginacao ? (
        <Paginas
          paginacao={lista.paginacao}
          endereco={(n) => enderecoDaLista(lista.filtro, lista.busca, n)}
          rotulo="pedidos"
        />
      ) : null}
      <p className="lista-nota">
        Os {lista.limite} pedidos mais recentes. Um mais antigo se acha pelo número.
      </p>
    </div>
  )
}
