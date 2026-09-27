import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDasAvaliacoes } from "@/components/avaliacoes"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ehFiltro, FILTROS, type Filtro, type TelaDasAvaliacoes } from "@/lib/avaliacoes"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

export const metadata: Metadata = { title: "Avaliações" }

type Busca = Promise<{ filtro?: string; pagina?: string }>

/** O endereço da lista: a fita e a página (os padrões não vão). */
const endereco = (filtro: Filtro, pagina = 1) => {
  const q = new URLSearchParams()
  if (filtro !== "novas") q.set("filtro", filtro)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/avaliacoes?${s}` : "/avaliacoes") as Route
}

/**
 * AVALIAÇÕES — as notas que chegam de quem comprou, pela página escondida
 * `/avaliar` da loja (o link vai no e-mail, um dia depois da entrega). A
 * nova espera aqui: aprovada, vai pro site (a página do produto e a esteira
 * da home); recusada, não vai. A fita e a página ficam no endereço
 * (`?filtro=no-site&pagina=2`); de 30 em 30.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { filtro, pagina } = await searchParams
  const q = new URLSearchParams()
  if (ehFiltro(filtro)) q.set("filtro", filtro)
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/avaliacoes?${q}`
  void ler(caminho)
  return (
    <SoPara area="avaliacoes">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

const nota = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

async function Lista({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="avaliacoes" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDasAvaliacoes

  return (
    <div data-tela>
      <Cabeca
        titulo="Avaliações"
        sub="As notas de quem comprou, pela página de avaliação (o link vai no e-mail, um dia depois da entrega). Aprovada, vai pro site."
      />
      <div className="numeros numeros--avaliacoes" data-numeros-avaliacoes>
        <div className="numero numero--destaque">
          <p className="numero__rot">Esperando você</p>
          <p className="numero__valor num">{tela.contagem.novas}</p>
          <p className="numero__sub">
            {tela.contagem.novas === 1 ? "avaliação nova" : "avaliações novas"}
          </p>
        </div>
        <div className="numero">
          <p className="numero__rot">No site</p>
          <p className="numero__valor num">{tela.noSite.total}</p>
          <p className="numero__sub">
            {tela.noSite.media !== null
              ? `média ${nota(tela.noSite.media)} de 5`
              : "nenhuma aprovada ainda"}
          </p>
        </div>
      </div>
      <nav className="filtros" aria-label="Filtrar avaliações">
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
        <ListaDasAvaliacoes tela={tela} />
      </section>
      {tela.paginacao ? (
        <Paginas
          paginacao={tela.paginacao}
          endereco={(n) => endereco(tela.filtro, n)}
          rotulo="avaliações"
        />
      ) : null}
      <p className="lista-nota">
        Recusar é pro que não é avaliação: ofensa, dado pessoal de alguém, propaganda. Nota baixa de
        quem comprou também é avaliação — e é a que mais convence quem está em dúvida. O texto vai
        pro site como a pessoa escreveu.
      </p>
    </div>
  )
}
