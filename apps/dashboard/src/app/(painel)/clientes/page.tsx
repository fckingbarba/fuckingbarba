import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDeClientes, BuscaDeClientes, ListaDosClientes } from "@/components/clientes"
import { Icone } from "@/components/icones"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { ListaDeClientes } from "@/lib/clientes"
import { lerMembro } from "@/lib/eu"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Clientes" }

type Busca = Promise<{ busca?: string }>

/**
 * CLIENTES — quem já comprou ou tem conta na loja: quantos pedidos, quanto
 * gastou e se aceita ofertas. A busca vai no endereço (`?busca=rafael`).
 * Os três papéis abrem; o marketing vê só quem aceitou ofertas, e sem a
 * cidade — o backend (`GET /dashboard/clientes`) já manda assim.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="clientes">
      <Lista searchParams={searchParams} />
    </SoPara>
  )
}

async function Lista({ searchParams }: { searchParams: Busca }) {
  const { busca } = await searchParams
  const q = new URLSearchParams()
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 80))

  const [r, leitura] = await Promise.all([
    medusa(`/dashboard/clientes?${q}`, { metodo: "GET", token: "sessao" }),
    lerMembro(),
  ])
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="clientes" />
  if (r.status !== 200 || leitura.estado !== "ok") return <ForaDoAr />
  const lista = r.corpo as unknown as ListaDeClientes
  const marketing = leitura.membro.papel === "marketing"

  return (
    <div data-tela>
      <Cabeca
        titulo="Clientes"
        sub={
          marketing
            ? "O marketing vê só quem aceitou receber ofertas — e sem CPF, telefone ou endereço (LGPD)."
            : "Quem já comprou ou tem conta na loja."
        }
      />
      <AbasDeClientes atual="lista" comNewsletter={leitura.areas.includes("newsletter")} />
      {marketing ? (
        <div className="faixa" data-nivel="info" data-visao-marketing>
          <Icone nome="cadeado" />
          <div>
            <p className="faixa__titulo">Visão do marketing</p>
            <p>
              {lista.comOfertas} de {lista.total}{" "}
              {lista.total === 1 ? "cliente aceitou" : "clientes aceitaram"} ofertas por e-mail ou
              WhatsApp. Os outros não aparecem aqui.
            </p>
          </div>
        </div>
      ) : null}
      <BuscaDeClientes busca={lista.busca} />
      <section className="bloco bloco--sem-pad">
        <ListaDosClientes clientes={lista.clientes} comCidade={!marketing} />
      </section>
    </div>
  )
}
