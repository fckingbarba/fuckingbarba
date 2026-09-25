import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDosCarrinhos } from "@/components/carrinhos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ehFiltro, FILTROS, type TelaDosCarrinhos } from "@/lib/carrinhos"
import { medusa } from "@/lib/medusa"
import { reais } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Carrinhos abandonados" }

type Busca = Promise<{ filtro?: string }>

/**
 * CARRINHOS ABANDONADOS — quem pôs produto na sacola e não fechou, nos
 * últimos 30 dias: o passo em que parou e o botão do WhatsApp. Os e-mails
 * automáticos vêm depois. O filtro fica no endereço (`?filtro=voltaram`).
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="carrinhos">
      <Lista searchParams={searchParams} />
    </SoPara>
  )
}

async function Lista({ searchParams }: { searchParams: Busca }) {
  const { filtro } = await searchParams
  const q = ehFiltro(filtro) ? `?filtro=${filtro}` : ""
  const r = await medusa(`/dashboard/carrinhos${q}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="carrinhos" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDosCarrinhos
  const { parados, voltaram, semContato } = tela.numeros
  const carrinhos = (n: number) => `${n} ${n === 1 ? "carrinho" : "carrinhos"}`

  return (
    <div data-tela>
      <Cabeca
        titulo="Carrinhos abandonados"
        sub="Quem pôs produto na sacola e não fechou a compra, nos últimos 30 dias — e em que passo parou. Os e-mails automáticos vêm depois."
      />
      <div className="numeros" data-numeros-carrinhos>
        <div className="numero numero--destaque">
          <p className="numero__rot">Parados</p>
          <p className="numero__valor num">{reais(parados.valor)}</p>
          <p className="numero__sub">{carrinhos(parados.quantos)}</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Voltaram e compraram</p>
          <p className="numero__valor num">{voltaram.quantos}</p>
          <p className="numero__sub">{reais(voltaram.valor)} nas sacolas</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Sem contato</p>
          <p className="numero__valor num">{semContato.quantos}</p>
          <p className="numero__sub">sem e-mail nem telefone: não dá pra chamar</p>
        </div>
      </div>
      <nav className="filtros" aria-label="Filtrar carrinhos">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            className="filtro"
            href={(f.id === "parados" ? "/carrinhos" : `/carrinhos?filtro=${f.id}`) as Route}
            aria-current={tela.filtro === f.id ? "page" : undefined}
          >
            {f.nome} <b>{tela.contagem[f.id] ?? 0}</b>
          </Link>
        ))}
      </nav>
      <section className="bloco bloco--sem-pad">
        <ListaDosCarrinhos tela={tela} />
      </section>
      <p className="lista-nota">
        Uma linha por pessoa, com a sacola mais recente dela. &ldquo;No site agora&rdquo; é quem
        mexeu na sacola há menos de 30 minutos; &ldquo;Voltaram e compraram&rdquo;, quem fez um
        pedido depois, com o mesmo e-mail.
        {tela.verContato
          ? ""
          : " O e-mail vem mascarado, e o telefone fica com o dono e a operação."}
      </p>
    </div>
  )
}
