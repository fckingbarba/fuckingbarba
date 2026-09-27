import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDosCarrinhos } from "@/components/carrinhos"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ehFiltro, FILTROS, type Filtro, type TelaDosCarrinhos } from "@/lib/carrinhos"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"
import { reais } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Carrinhos abandonados" }

type Busca = Promise<{ filtro?: string; pagina?: string }>

/** O endereço da lista: o filtro e a página (os padrões não vão). */
const endereco = (filtro: Filtro, pagina = 1) => {
  const q = new URLSearchParams()
  if (filtro !== "parados") q.set("filtro", filtro)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/carrinhos?${s}` : "/carrinhos") as Route
}

/**
 * CARRINHOS ABANDONADOS — quem pôs produto na sacola e não fechou, nos
 * últimos 30 dias: o passo em que parou e o botão do WhatsApp. Os e-mails
 * automáticos vêm depois. O filtro e a página ficam no endereço
 * (`?filtro=voltaram&pagina=2`); de 30 em 30.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { filtro, pagina } = await searchParams
  const q = new URLSearchParams()
  if (ehFiltro(filtro)) q.set("filtro", filtro)
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/carrinhos?${q}`
  void ler(caminho)
  return (
    <SoPara area="carrinhos">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

async function Lista({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
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
            href={endereco(f.id)}
            aria-current={tela.filtro === f.id ? "page" : undefined}
          >
            {f.nome} <b>{tela.contagem[f.id] ?? 0}</b>
          </Link>
        ))}
      </nav>
      <section className="bloco bloco--sem-pad">
        <ListaDosCarrinhos tela={tela} />
      </section>
      {tela.paginacao ? (
        <Paginas
          paginacao={tela.paginacao}
          endereco={(n) => endereco(tela.filtro, n)}
          rotulo="carrinhos"
        />
      ) : null}
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
