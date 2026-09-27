import type { Metadata, Route } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDeClientes, BuscaDeClientes, ListaDosClientes } from "@/components/clientes"
import { Icone } from "@/components/icones"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { ListaDeClientes } from "@/lib/clientes"
import { lerMembro } from "@/lib/eu"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

export const metadata: Metadata = { title: "Clientes" }

type Busca = Promise<{ busca?: string; pagina?: string }>

/** O endereço da lista: a busca e a página (a primeira não vai). */
const endereco = (busca: string, pagina: number) => {
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/clientes?${s}` : "/clientes") as Route
}

/**
 * CLIENTES — quem já comprou ou tem conta na loja: quantos pedidos, quanto
 * gastou e se aceita ofertas. A busca vai no endereço (`?busca=rafael`).
 * Os três papéis abrem; o marketing vê só quem aceitou ofertas, e sem a
 * cidade — o backend (`GET /dashboard/clientes`) já manda assim. De 30 em
 * 30 (`?pagina=`), e a leitura sai junto com a pergunta de quem é (`ler`).
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { busca, pagina } = await searchParams
  const q = new URLSearchParams()
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 80))
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/clientes?${q}`
  void ler(caminho)
  return (
    <SoPara area="clientes">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

async function Lista({ caminho }: { caminho: string }) {
  const [r, leitura] = await Promise.all([ler(caminho), lerMembro()])
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
      {lista.paginacao ? (
        <Paginas
          paginacao={lista.paginacao}
          endereco={(n) => endereco(lista.busca, n)}
          rotulo="clientes"
        />
      ) : null}
    </div>
  )
}
