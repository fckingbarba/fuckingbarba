import type { Metadata, Route } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDeClientes } from "@/components/clientes"
import { ListaDaNewsletter } from "@/components/newsletter"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { Newsletter } from "@/lib/clientes"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

export const metadata: Metadata = { title: "Newsletter" }

/**
 * A NEWSLETTER — quem aceitou receber ofertas por e-mail, numa lista só: o
 * rodapé da loja e a caixa de "Meus dados" da conta (`GET
 * /dashboard/newsletter` junta os dois). É uma aba de Clientes, e não uma
 * lista à parte: o e-mail de cliente leva pra ficha, e a ficha mostra o
 * mesmo "sim". Marketing e dono. De 50 em 50 (`?pagina=`); o CSV leva todos.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>
}) {
  const p = paginaDoEndereco((await searchParams).pagina)
  const caminho = p && p > 1 ? `/dashboard/newsletter?pagina=${p}` : "/dashboard/newsletter"
  void ler(caminho)
  return (
    <SoPara area="newsletter">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

const pagina = (n: number) =>
  (n > 1 ? `/clientes/newsletter?pagina=${n}` : "/clientes/newsletter") as Route

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "—")

async function Lista({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="newsletter" />
  if (r.status !== 200) return <ForaDoAr />
  const { inscritos, numeros: n, paginacao } = r.corpo as unknown as Newsletter

  return (
    <div data-tela>
      <Cabeca
        titulo="Clientes"
        ajuda="Quem aceitou receber ofertas por e-mail: no rodapé da loja ou na conta."
      />
      <AbasDeClientes atual="newsletter" comNewsletter />
      <div className="numeros" data-numeros-newsletter>
        <div className="numero numero--destaque">
          <p className="numero__rot">Recebem ofertas</p>
          <p className="numero__valor num">{n.total}</p>
          <p className="numero__sub">
            {n.semana ? `+${n.semana} esta semana` : "nenhum novo esta semana"}
          </p>
        </div>
        <div className="numero">
          <p className="numero__rot">Do rodapé</p>
          <p className="numero__valor num">{n.rodape}</p>
          <p className="numero__sub">{pct(n.rodape, n.total)}</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Da conta</p>
          <p className="numero__valor num">{n.conta}</p>
          <p className="numero__sub">{pct(n.conta, n.total)}</p>
        </div>
      </div>
      <ListaDaNewsletter
        inscritos={inscritos}
        paginas={
          paginacao ? (
            <Paginas paginacao={paginacao} endereco={pagina} rotulo="quem recebe ofertas" />
          ) : null
        }
      />
    </div>
  )
}
